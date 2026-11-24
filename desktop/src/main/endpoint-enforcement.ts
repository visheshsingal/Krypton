import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildPacScript,
  buildRegularBrowserBlockPage,
  hostMatchesProtectedDomain,
  resolveProtectedAiDomains,
} from './ai-site-catalog';
import {
  applyPacAutoConfig,
  isOurPacUrl,
  readWindowsProxySnapshot,
  restoreWindowsProxySnapshot,
  WindowsProxySnapshot,
} from './windows-proxy-settings';

export type EndpointEnforcementState =
  | 'protected'
  | 'not_protected'
  | 'outside_schedule'
  | 'policy_expired'
  | 'enforcement_unavailable'
  | 'proxy_tampered';

export type EndpointEnforcementStatus = {
  state: EndpointEnforcementState;
  ready: boolean;
  pacActive: boolean;
  listenerActive: boolean;
  domains: string[];
  pacUrl: string | null;
  detail: string;
  failClosed: boolean;
  coverage: string;
};

export type EndpointEnforcementHooks = {
  applyPac?: (pacUrl: string) => Promise<void>;
  readProxy?: () => Promise<{ autoConfigUrl: string }>;
  restoreProxy?: (snapshot: WindowsProxySnapshot) => Promise<void>;
  readSnapshot?: () => Promise<WindowsProxySnapshot>;
};

const MARKER_FILE = 'endpoint-enforcement-state.json';

type MarkerFile = {
  previousProxy: WindowsProxySnapshot;
  pacUrl: string;
};

export class EndpointEnforcementService {
  private server: http.Server | null = null;
  private port: number | null = null;
  private domains: string[] = resolveProtectedAiDomains(undefined);
  private previousProxy: WindowsProxySnapshot | null = null;
  private desiredActive = false;
  private tampered = false;
  private lastError: string | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private readonly userDataPath: string;
  private readonly hooks: EndpointEnforcementHooks;

  constructor(userDataPath: string, hooks: EndpointEnforcementHooks = {}) {
    this.userDataPath = userDataPath;
    this.hooks = hooks;
  }

  public setDomains(policyDomains: unknown): void {
    this.domains = resolveProtectedAiDomains(policyDomains);
  }

  public getDomains(): string[] {
    return [...this.domains];
  }

  public getPacUrl(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}/proxy.pac` : null;
  }

  public getStatus(options: {
    licenseValid: boolean;
    policyValid: boolean;
    scheduleActive: boolean;
    platform: NodeJS.Platform;
  }): EndpointEnforcementStatus {
    const coverage = 'Windows 10/11 x64; ordinary installed Google Chrome and Microsoft Edge via user PAC; listed admin AI hostnames only. Managed Chrome/Edge launched by Krypton Guard bypass the PAC with --proxy-server=direct://.';
    if (options.platform !== 'win32') {
      return this.status('enforcement_unavailable', false, 'Regular-browser AI site blocking is implemented for Windows only.', coverage);
    }
    if (!options.licenseValid || !options.policyValid) {
      return this.status('policy_expired', false, 'License or cached policy is not valid. Protected browsing is unavailable; user-level regular-browser blocking may no longer be active.', coverage, true);
    }
    if (this.lastError) {
      return this.status('enforcement_unavailable', false, this.lastError, coverage, true);
    }
    if (!options.scheduleActive) {
      return this.status('outside_schedule', false, 'Outside the administrator-configured protection hours. Regular Chrome/Edge are not blocked.', coverage);
    }
    if (this.tampered) {
      return this.status('proxy_tampered', false, 'The Windows PAC setting was changed. Regular-browser blocking is not in force. Status is Not Protected.', coverage, true);
    }
    if (!this.server || this.port === null || !this.desiredActive) {
      return this.status(
        'enforcement_unavailable',
        false,
        this.lastError || 'The local enforcement listener is not running. Regular Chrome/Edge are not blocked.',
        coverage,
        true,
      );
    }
    return this.status(
      'protected',
      true,
      'Configured AI sites are blocked in ordinary Chrome/Edge. Use Krypton Guard to open the isolated protected profile.',
      coverage,
    );
  }

  public async sync(options: {
    shouldBlockRegularBrowsers: boolean;
    policyDomains?: unknown;
    platform?: NodeJS.Platform;
  }): Promise<EndpointEnforcementStatus> {
    this.setDomains(options.policyDomains);
    const platform = options.platform ?? process.platform;
    if (platform !== 'win32') {
      await this.stop();
      return this.getStatus({
        licenseValid: true,
        policyValid: true,
        scheduleActive: options.shouldBlockRegularBrowsers,
        platform,
      });
    }

    if (!options.shouldBlockRegularBrowsers) {
      try {
        await this.stop();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
      return this.getStatus({
        licenseValid: true,
        policyValid: true,
        scheduleActive: false,
        platform,
      });
    }

    try {
      await this.startListener();
      await this.applyProxy();
      this.desiredActive = true;
      this.tampered = false;
      this.lastError = null;
      this.startWatchdog();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.desiredActive = false;
      try {
        await this.restoreProxyIfNeeded();
      } catch (restoreError) {
        this.lastError = `${this.lastError} Proxy restoration also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`;
      }
      await this.stopListenerOnly();
    }

    return this.getStatus({
      licenseValid: true,
      policyValid: true,
      scheduleActive: true,
      platform,
    });
  }

  public async stop(): Promise<void> {
    this.stopWatchdog();
    this.desiredActive = false;
    this.tampered = false;
    this.lastError = null;
    try {
      await this.restoreProxyIfNeeded();
    } finally {
      await this.stopListenerOnly();
    }
  }

  public async recoverStaleProxy(): Promise<void> {
    if (this.desiredActive) return;
    const marker = this.readMarker();
    if (!marker) return;

    const readProxy = this.hooks.readProxy || (async () => {
      const snapshot = await readWindowsProxySnapshot();
      return { autoConfigUrl: snapshot.autoConfigUrl };
    });
    const current = await readProxy();
    if (isOurPacUrl(current.autoConfigUrl, marker.pacUrl)) {
      await (this.hooks.restoreProxy || restoreWindowsProxySnapshot)(marker.previousProxy);
    }
    this.removeMarker();
    this.previousProxy = null;
  }

  public async cleanupForUninstall(): Promise<void> {
    await this.stop();
    this.removeMarker();
  }

  public matchesBlockedHost(hostname: string): boolean {
    return hostMatchesProtectedDomain(hostname, this.domains);
  }

  private status(
    state: EndpointEnforcementState,
    ready: boolean,
    detail: string,
    coverage: string,
    failClosed = state === 'policy_expired' || state === 'proxy_tampered' || state === 'enforcement_unavailable',
  ): EndpointEnforcementStatus {
    return {
      state,
      ready: ready && state === 'protected',
      pacActive: this.desiredActive && Boolean(this.server) && !this.tampered,
      listenerActive: Boolean(this.server),
      domains: this.getDomains(),
      pacUrl: this.getPacUrl(),
      detail,
      failClosed,
      coverage,
    };
  }

  private async startListener(): Promise<void> {
    if (this.server && this.port !== null) return;
    await new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      server.on('connect', (req, socket) => this.handleConnect(req, socket));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('The local enforcement listener did not bind a TCP port.'));
          return;
        }
        this.server = server;
        this.port = address.port;
        resolve();
      });
    });
  }

  private async stopListenerOnly(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = null;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port || 0}`);
    if (url.pathname === '/proxy.pac') {
      res.writeHead(200, {
        'Content-Type': 'application/x-ns-proxy-autoconfig',
        'Cache-Control': 'no-store',
      });
      res.end(buildPacScript(this.port || 0, this.domains));
      return;
    }

    const targetHost = hostFromProxyRequest(req);
    const page = buildRegularBrowserBlockPage(targetHost || url.searchParams.get('host') || '', this.domains);
    res.writeHead(403, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(page);
  }

  private handleConnect(req: http.IncomingMessage, socket: { write: (chunk: string) => void; end: () => void }): void {
    const host = (req.url || '').split(':')[0] || '';
    const page = buildRegularBrowserBlockPage(host, this.domains);
    socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n');
    socket.write(page);
    socket.end();
  }

  private async applyProxy(): Promise<void> {
    const pacUrl = this.getPacUrl();
    if (!pacUrl) throw new Error('The PAC listener is not ready.');
    const readSnapshot = this.hooks.readSnapshot || readWindowsProxySnapshot;
    const applyPac = this.hooks.applyPac || applyPacAutoConfig;
    if (!this.previousProxy) {
      this.previousProxy = await readSnapshot();
      this.writeMarker(this.previousProxy, pacUrl);
    }
    await applyPac(pacUrl);
  }

  private async restoreProxyIfNeeded(): Promise<void> {
    const marker = this.readMarker();
    const snapshot = this.previousProxy || marker?.previousProxy;
    if (!snapshot) return;
    const pacUrl = marker?.pacUrl || this.getPacUrl();
    if (!pacUrl) return;
    const readProxy = this.hooks.readProxy || (async () => {
      const current = await readWindowsProxySnapshot();
      return { autoConfigUrl: current.autoConfigUrl };
    });
    const current = await readProxy();
    if (!isOurPacUrl(current.autoConfigUrl, pacUrl)) {
      this.previousProxy = null;
      this.removeMarker();
      return;
    }

    const restore = this.hooks.restoreProxy || restoreWindowsProxySnapshot;
    await restore(snapshot);
    this.previousProxy = null;
    this.removeMarker();
  }

  private startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      void this.verifyProxy();
    }, 15_000);
    this.watchdog.unref?.();
  }

  private stopWatchdog(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  private async verifyProxy(): Promise<void> {
    const pacUrl = this.getPacUrl();
    if (!this.desiredActive || !pacUrl) return;
    const readProxy = this.hooks.readProxy || (async () => {
      const snapshot = await readWindowsProxySnapshot();
      return { autoConfigUrl: snapshot.autoConfigUrl };
    });
    try {
      const current = await readProxy();
      if (!isOurPacUrl(current.autoConfigUrl, pacUrl)) {
        this.tampered = true;
        try {
          await (this.hooks.applyPac || applyPacAutoConfig)(pacUrl);
          const again = await readProxy();
          this.tampered = !isOurPacUrl(again.autoConfigUrl, pacUrl);
        } catch {
          this.tampered = true;
        }
      } else {
        this.tampered = false;
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private markerPath(): string {
    return path.join(this.userDataPath, MARKER_FILE);
  }

  private writeMarker(previousProxy: WindowsProxySnapshot, pacUrl: string): void {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.writeFileSync(this.markerPath(), JSON.stringify({ previousProxy, pacUrl } satisfies MarkerFile), 'utf8');
  }

  private readMarker(): MarkerFile | null {
    if (!fs.existsSync(this.markerPath())) return null;
    try {
      const value = JSON.parse(fs.readFileSync(this.markerPath(), 'utf8')) as Partial<MarkerFile>;
      if (
        typeof value.pacUrl !== 'string' ||
        !value.previousProxy ||
        typeof value.previousProxy.proxyEnable !== 'string' ||
        typeof value.previousProxy.proxyServer !== 'string' ||
        typeof value.previousProxy.autoConfigUrl !== 'string'
      ) {
        throw new Error('The saved Windows proxy recovery marker is malformed.');
      }
      return value as MarkerFile;
    } catch (error) {
      throw new Error(`Could not read the Windows proxy recovery marker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private removeMarker(): void {
    const markerPath = this.markerPath();
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
  }
}

function hostFromProxyRequest(req: http.IncomingMessage): string {
  const raw = req.url || '';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return new URL(raw).hostname;
  } catch {
    // Ignore malformed absolute URLs.
  }
  return (req.headers.host || '').split(':')[0];
}

export function describeFailClosedPromptAction(): { action: 'block'; explanation: string } {
  return {
    action: 'block',
    explanation: 'Krypton is not in a validated protected state. Prompt submission is blocked until policy is valid and enforcement is ready.',
  };
}
