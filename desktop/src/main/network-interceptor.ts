import * as http from 'http';
import * as net from 'net';
import * as stream from 'stream';
import { exec } from 'child_process';
import { PromptSecurityEngine } from '../engine/scanner';
import { PromptScanResult } from '@krypton/shared';
import { Notification } from 'electron';
import { isAiPromptRequestUrl, extractRequestText } from './managed-browser';

export interface InterceptorStats {
  requestsInspected: number;
  threatsBlocked: number;
  allowedRequests: number;
  activePort: number | null;
  proxyActive: boolean;
}

export class LocalNetworkInterceptor {
  private server: http.Server | null = null;
  private port = 8787;
  private isRunning = false;
  private scanner: PromptSecurityEngine;
  private onReportEvent?: (event: Record<string, unknown>) => void;
  private requestsInspected = 0;
  private threatsBlocked = 0;
  private allowedRequests = 0;

  constructor(
    scanner: PromptSecurityEngine,
    onReportEvent?: (event: Record<string, unknown>) => void,
    port = 8787,
  ) {
    this.scanner = scanner;
    this.onReportEvent = onReportEvent;
    this.port = port;
  }

  public updateScanner(scanner: PromptSecurityEngine): void {
    this.scanner = scanner;
  }

  public async start(): Promise<{ success: boolean; port: number; error?: string }> {
    if (this.isRunning && this.server) {
      return { success: true, port: this.port };
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Handle HTTPS CONNECT tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleHttpsConnect(req, clientSocket, head);
      });

      this.server.on('error', (err: any) => {
        console.error('[NetworkInterceptor] Server error:', err.message);
        if (!this.isRunning) {
          resolve({ success: false, port: this.port, error: err.message });
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true;
        this.enableWindowsSystemProxy(this.port);
        resolve({ success: true, port: this.port });
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning && !this.server) return;

    this.disableWindowsSystemProxy();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.isRunning = false;
          resolve();
        });
      } else {
        this.isRunning = false;
        resolve();
      }
    });
  }

  public inspectPayload(
    url: string,
    method: string,
    body: string,
  ): { blocked: boolean; result: PromptScanResult } {
    this.requestsInspected++;

    if (!isAiPromptRequestUrl(url, method)) {
      this.allowedRequests++;
      return {
        blocked: false,
        result: {
          hasRisk: false,
          highestRisk: 'LOW',
          action: 'allow',
          matches: [],
          redactedPrompt: body,
          explanation: '',
        },
      };
    }

    const textToScan = extractRequestText(body);
    const result = this.scanner.scan(textToScan);

    if (result.hasRisk && result.action === 'block') {
      this.threatsBlocked++;
      const topMatch = result.matches[0];

      this.notifyWindows(
        'Krypton DLP: Outgoing AI Prompt Blocked',
        `Blocked ${topMatch?.ruleName || 'Sensitive Data'}. Prevented submission to AI service.`,
      );

      if (this.onReportEvent) {
        this.onReportEvent({
          targetApp: url,
          riskLevel: result.highestRisk,
          ruleCode: topMatch?.ruleCode || 'NETWORK_DLP_BLOCK',
          ruleName: topMatch?.ruleName || 'Sensitive Data Blocked',
          actionTaken: 'block',
          redactedPreview: result.redactedPrompt?.slice(0, 500),
          timestamp: new Date().toISOString(),
        });
      }

      return { blocked: true, result };
    }

    this.allowedRequests++;
    return { blocked: false, result };
  }

  public getStats(): InterceptorStats {
    return {
      requestsInspected: this.requestsInspected,
      threatsBlocked: this.threatsBlocked,
      allowedRequests: this.allowedRequests,
      activePort: this.isRunning ? this.port : null,
      proxyActive: this.isRunning,
    };
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const rawUrl = req.url || '';
    const method = req.method || 'GET';

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const { blocked } = this.inspectPayload(rawUrl, method, body);

      if (blocked) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message: 'Blocked by Krypton Endpoint DLP: Sensitive data was detected in this prompt.',
              type: 'krypton_dlp_blocked',
              code: 'SECURITY_VIOLATION',
            },
          }),
        );
        return;
      }

      // Forward request to actual host
      try {
        const parsedUrl = new URL(rawUrl);
        const proxyReq = http.request(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on('error', () => {
          res.writeHead(502);
          res.end('Bad Gateway');
        });

        proxyReq.write(body);
        proxyReq.end();
      } catch {
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  }

  private handleHttpsConnect(
    req: http.IncomingMessage,
    clientSocket: stream.Duplex,
    head: Buffer,
  ): void {
    const [targetHost, targetPortStr] = (req.url || '').split(':');
    const targetPort = parseInt(targetPortStr, 10) || 443;

    const serverSocket = net.connect(targetPort, targetHost, () => {
      clientSocket.write(
        'HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-agent: Krypton-DLP-Agent\r\n\r\n',
      );
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', () => {
      clientSocket.destroy();
    });

    clientSocket.on('error', () => {
      serverSocket.destroy();
    });
  }

  private enableWindowsSystemProxy(port: number): void {
    if (process.platform !== 'win32') return;

    const cmdEnable = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`;
    const cmdServer = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:${port}" /f`;

    exec(`${cmdEnable} && ${cmdServer}`, (err) => {
      if (err) console.warn('[NetworkInterceptor] Could not set Windows proxy registry:', err.message);
    });
  }

  private disableWindowsSystemProxy(): void {
    if (process.platform !== 'win32') return;

    const cmdDisable = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`;
    exec(cmdDisable, (err) => {
      if (err) console.warn('[NetworkInterceptor] Could not reset Windows proxy registry:', err.message);
    });
  }

  private notifyWindows(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title,
          body,
          silent: false,
        });
        notification.show();
      }
    } catch {
      // Ignored
    }
  }
}
