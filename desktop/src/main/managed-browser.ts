import { spawn, spawnSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import { PromptSecurityEngine } from '../engine/scanner';
import { PromptScanResult } from '@krypton/shared';

export type ManagedBrowserKind = 'chrome' | 'edge';

export function isManagedBrowserKind(value: unknown): value is ManagedBrowserKind {
  return value === 'chrome' || value === 'edge';
}

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, any>;
  sessionId?: string;
  result?: Record<string, any>;
  error?: { message?: string };
};

type CdpPending = {
  resolve: (value: Record<string, any>) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type PageTarget = {
  sessionId: string;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
};

type ManagedBrowserOptions = {
  browser: ManagedBrowserKind;
  profileRoot: string;
  scanner: PromptSecurityEngine;
  onBlocked: (result: PromptScanResult, hostname: string) => void;
};

const CDP_REQUEST_TIMEOUT_MS = 15_000;
const MAX_SCANNED_REQUEST_BYTES = 2 * 1024 * 1024;
const AI_HOST_GLOBS = [
  'https://chatgpt.com/*',
  'https://*.chatgpt.com/*',
  'https://*.openai.com/*',
  'https://claude.ai/*',
  'https://*.claude.ai/*',
  'https://*.anthropic.com/*',
  'https://gemini.google.com/*',
  'https://generativelanguage.googleapis.com/*',
  'https://copilot.microsoft.com/*',
  'https://*.bing.com/*',
  'https://www.perplexity.ai/*',
  'https://*.perplexity.ai/*',
];

const PROMPT_PATH_PARTS = [
  'conversation',
  'completion',
  'messages',
  'responses',
  'chat',
  'generate',
  'query',
  'stream',
  'assistant',
];

export function isAiPromptRequestUrl(rawUrl: string, method: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  const supportedHost =
    host === 'chatgpt.com' || host.endsWith('.chatgpt.com') ||
    host === 'openai.com' || host.endsWith('.openai.com') ||
    host === 'claude.ai' || host.endsWith('.claude.ai') ||
    host === 'anthropic.com' || host.endsWith('.anthropic.com') ||
    host === 'gemini.google.com' ||
    host === 'generativelanguage.googleapis.com' ||
    host === 'copilot.microsoft.com' ||
    host === 'bing.com' || host.endsWith('.bing.com') ||
    host === 'perplexity.ai' || host.endsWith('.perplexity.ai');
  if (!supportedHost) return false;

  const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
  return PROMPT_PATH_PARTS.some((part) => pathAndQuery.includes(part));
}

export function extractRequestText(postData: string): string {
  if (postData.length > MAX_SCANNED_REQUEST_BYTES) return '';
  try {
    const parsed: unknown = JSON.parse(postData);
    const chunks: string[] = [];
    const visit = (value: unknown, depth: number) => {
      if (depth > 12 || chunks.length >= 500) return;
      if (typeof value === 'string') {
        chunks.push(value);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) visit(item, depth + 1);
        return;
      }
      if (value && typeof value === 'object') {
        for (const item of Object.values(value)) visit(item, depth + 1);
      }
    };
    visit(parsed, 0);
    return chunks.join('\n');
  } catch {
    return postData;
  }
}

function browserCandidates(browser: ManagedBrowserKind, env: NodeJS.ProcessEnv): string[] {
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = env.LOCALAPPDATA || '';
  if (browser === 'chrome') {
    return [
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean);
  }
  return [
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
}

export function findManagedBrowserExecutable(
  browser: ManagedBrowserKind,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const candidate of browserCandidates(browser, env)) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const command = browser === 'chrome' ? 'chrome.exe' : 'msedge.exe';
  const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !result.stdout) return null;
  const discovered = result.stdout.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean);
  return discovered && fs.existsSync(discovered) ? discovered : null;
}

class CdpConnection {
  private readonly socket: WebSocket;
  private nextId = 0;
  private readonly pending = new Map<number, CdpPending>();
  private readonly eventHandlers = new Map<string, Set<(message: CdpMessage) => void>>();
  private readonly closeHandlers = new Set<() => void>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw: WebSocket.RawData) => {
      let message: CdpMessage;
      try {
        message = JSON.parse(raw.toString()) as CdpMessage;
      } catch {
        return;
      }

      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'DevTools command failed.'));
        else pending.resolve(message.result || {});
        return;
      }

      if (!message.method) return;
      for (const handler of this.eventHandlers.get(message.method) || []) handler(message);
    });

    socket.on('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('The managed browser disconnected from Krypton.'));
      }
      this.pending.clear();
      for (const handler of this.closeHandlers) handler();
    });

    socket.on('error', (error) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.pending.clear();
    });
  }

  public static connect(url: string): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, {
        perMessageDeflate: false,
        handshakeTimeout: CDP_REQUEST_TIMEOUT_MS,
      });
      socket.once('open', () => resolve(new CdpConnection(socket)));
      socket.once('error', reject);
    });
  }

  public on(method: string, handler: (message: CdpMessage) => void): void {
    const handlers = this.eventHandlers.get(method) || new Set();
    handlers.add(handler);
    this.eventHandlers.set(method, handlers);
  }

  public onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }

  public send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, any>> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools command timed out: ${method}`));
      }, CDP_REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  public close(): void {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }
}

export class ManagedBrowserSession {
  private readonly browser: ManagedBrowserKind;
  private readonly profilePath: string;
  private readonly scanner: PromptSecurityEngine;
  private readonly onBlocked: ManagedBrowserOptions['onBlocked'];
  private connection: CdpConnection | null = null;
  private process: ChildProcess | null = null;
  private readonly targets = new Map<string, PageTarget>();
  private closing = false;

  private constructor(options: ManagedBrowserOptions, profilePath: string) {
    this.browser = options.browser;
    this.profilePath = profilePath;
    this.scanner = options.scanner;
    this.onBlocked = options.onBlocked;
  }

  public static async launch(options: ManagedBrowserOptions): Promise<ManagedBrowserSession> {
    if (process.platform !== 'win32') {
      throw new Error('Managed Chrome and Edge protection is currently available on Windows only.');
    }

    const executable = findManagedBrowserExecutable(options.browser);
    if (!executable) {
      throw new Error(`Install ${options.browser === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'} to connect it to Krypton.`);
    }

    const profilePath = path.join(options.profileRoot, options.browser);
    fs.mkdirSync(profilePath, { recursive: true });
    const session = new ManagedBrowserSession(options, profilePath);

    try {
      let endpoint = await session.readExistingEndpoint();
      if (!endpoint) endpoint = await session.startBrowser(executable);
      session.connection = await CdpConnection.connect(endpoint);
      session.connection.onClose(() => {
        if (!session.closing && session.process && !session.process.killed) {
          session.process.kill();
        }
      });
      await session.configureTargets();
      return session;
    } catch (error) {
      session.connection?.close();
      if (session.process && !session.process.killed) session.process.kill();
      throw error;
    }
  }

  public async openUrl(url: string): Promise<void> {
    const connection = this.requireConnection();
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
    const target = await this.waitForTarget(targetId);
    await target.ready;
    await connection.send('Page.navigate', { url }, target.sessionId);
  }

  public async close(): Promise<void> {
    if (!this.connection) return;
    this.closing = true;
    try {
      await this.connection.send('Browser.close', {});
    } catch {
      this.connection.close();
    }
    this.connection.close();
  }

  private requireConnection(): CdpConnection {
    if (!this.connection) throw new Error('The managed browser connection is not active.');
    return this.connection;
  }

  private async configureTargets(): Promise<void> {
    const connection = this.requireConnection();
    connection.on('Target.attachedToTarget', (message) => {
      const params = message.params;
      if (params) void this.handleAttachedTarget(params);
    });
    connection.on('Fetch.requestPaused', (message) => {
      const params = message.params;
      if (params && message.sessionId) {
        void this.handlePausedRequest(params, message.sessionId).catch(async () => {
          const requestId = params.requestId;
          if (requestId) {
            await connection.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, message.sessionId).catch(() => undefined);
          }
          await this.showProtectionNotice(message.sessionId!, 'Krypton could not safely inspect this AI submission, so it was stopped.');
        });
      }
    });

    await connection.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos = [] } = await connection.send('Target.getTargets');
    for (const target of targetInfos) {
      if (target.type === 'page') {
        await connection.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      }
    }
    await connection.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });
  }

  private async handleAttachedTarget(params: Record<string, any>): Promise<void> {
    const connection = this.requireConnection();
    const { sessionId, targetInfo } = params;
    if (!sessionId || !targetInfo?.targetId) return;

    if (targetInfo.type !== 'page') {
      void connection.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
      return;
    }
    if (this.targets.has(targetInfo.targetId)) {
      void connection.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
      return;
    }

    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const target: PageTarget = { sessionId, ready, resolveReady, rejectReady };
    this.targets.set(targetInfo.targetId, target);

    try {
      await connection.send('Page.enable', {}, sessionId);
      await connection.send('Fetch.enable', {
        patterns: AI_HOST_GLOBS.map((urlPattern) => ({ urlPattern, requestStage: 'Request' })),
      }, sessionId);
      await connection.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
      target.resolveReady();
    } catch (error) {
      target.rejectReady(error instanceof Error ? error : new Error('Could not enable request protection.'));
      await connection.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
    }
  }

  private async handlePausedRequest(
    params: Record<string, any>,
    sessionId: string,
  ): Promise<void> {
    const connection = this.requireConnection();
    const requestId = params.requestId;
    const request = params.request;
    if (!requestId || !request) return;

    if (!isAiPromptRequestUrl(request.url, request.method || 'GET')) {
      await connection.send('Fetch.continueRequest', { requestId }, sessionId).catch(() => undefined);
      return;
    }

    let postData: string | undefined = request.postData;
    if (!postData && request.hasPostData) {
      try {
        const result = await connection.send('Fetch.getRequestPostData', { requestId }, sessionId);
        postData = result.postData;
      } catch {
        await connection.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => undefined);
        await this.showProtectionNotice(sessionId, 'Krypton could not inspect this AI submission, so it was stopped.');
        return;
      }
    }

    if (!postData) {
      await connection.send('Fetch.continueRequest', { requestId }, sessionId).catch(() => undefined);
      return;
    }
    if (Buffer.byteLength(postData, 'utf8') > MAX_SCANNED_REQUEST_BYTES) {
      await connection.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => undefined);
      await this.showProtectionNotice(sessionId, 'Krypton could not safely scan this large AI submission, so it was stopped.');
      return;
    }

    const scanText = extractRequestText(postData);
    const result = this.scanner.scan(scanText);
    if (!result.hasRisk || result.action === 'allow') {
      await connection.send('Fetch.continueRequest', { requestId }, sessionId).catch(() => undefined);
      return;
    }

    if (result.action === 'warn') {
      const { dialog } = await import('electron');
      const response = await dialog.showMessageBox({
        type: 'warning',
        title: 'Krypton detected sensitive content',
        message: 'This AI submission may contain sensitive information.',
        detail: result.matches.slice(0, 5).map((match) => match.ruleName).join('\n'),
        buttons: ['Cancel submission', 'Send anyway'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response.response === 1) {
        await connection.send('Fetch.continueRequest', { requestId }, sessionId).catch(() => undefined);
      } else {
        await connection.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => undefined);
        await this.reportBlocked(result, request.url);
        await this.showProtectionNotice(sessionId, 'Krypton stopped this submission after your confirmation.');
      }
      return;
    }

    await connection.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => undefined);
    await this.reportBlocked(result, request.url);
    await this.showProtectionNotice(
      sessionId,
      `Krypton blocked this submission: ${result.matches.slice(0, 3).map((match) => match.ruleName).join(', ')}`,
    );
  }

  private async reportBlocked(result: PromptScanResult, requestUrl: string): Promise<void> {
    try {
      this.onBlocked(result, new URL(requestUrl).hostname);
    } catch (error) {
      console.error('[ProtectedBrowser] Could not report blocked submission metadata:', error);
    }
  }

  private async showProtectionNotice(sessionId: string, message: string): Promise<void> {
    const expression = `(() => {
      const id = 'krypton-protection-notice';
      let notice = document.getElementById(id);
      if (!notice) {
        notice = document.createElement('div');
        notice.id = id;
        notice.setAttribute('role', 'alert');
        notice.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:420px;padding:14px 18px;border:1px solid #ef4444;border-radius:12px;background:#111827;color:#f8fafc;box-shadow:0 12px 40px #0009;font:14px/1.5 system-ui,sans-serif';
        (document.body || document.documentElement).appendChild(notice);
      }
      notice.textContent = ${JSON.stringify(message)};
      setTimeout(() => notice.remove(), 8000);
    })()`;
    await this.requireConnection().send('Runtime.evaluate', { expression }, sessionId).catch(() => undefined);
  }

  private async waitForTarget(targetId: string): Promise<PageTarget> {
    const deadline = Date.now() + CDP_REQUEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const target = this.targets.get(targetId);
      if (target) return target;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Krypton could not attach to the managed browser tab.');
  }

  private async readExistingEndpoint(): Promise<string | null> {
    const activePortPath = path.join(this.profilePath, 'DevToolsActivePort');
    try {
      const [portLine] = (await fs.promises.readFile(activePortPath, 'utf8')).split(/\r?\n/);
      const port = Number(portLine);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
      return await this.getBrowserWebSocketUrl(port);
    } catch {
      return null;
    }
  }

  private async startBrowser(executable: string): Promise<string> {
    const child = spawn(executable, [
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profilePath}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ], {
      detached: false,
      stdio: 'ignore',
      windowsHide: false,
    });
    this.process = child;
    child.once('error', (error) => {
      console.error('[ProtectedBrowser] Failed to launch managed browser:', error.message);
    });

    const activePortPath = path.join(this.profilePath, 'DevToolsActivePort');
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error('The selected browser closed before Krypton could connect.');
      }
      try {
        const [portLine] = (await fs.promises.readFile(activePortPath, 'utf8')).split(/\r?\n/);
        const port = Number(portLine);
        if (Number.isInteger(port) && port > 0 && port <= 65535) {
          return await this.getBrowserWebSocketUrl(port);
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error('Krypton could not connect to the selected browser. Close it and try again.');
  }

  private async getBrowserWebSocketUrl(port: number): Promise<string> {
    const endpoint = new URL(`http://127.0.0.1:${port}/json/version`);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) throw new Error('The managed browser DevTools endpoint is unavailable.');
    const metadata = await response.json() as { webSocketDebuggerUrl?: string };
    const websocketUrl = new URL(metadata.webSocketDebuggerUrl || '');
    if (
      websocketUrl.protocol !== 'ws:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(websocketUrl.hostname) ||
      Number(websocketUrl.port) !== port ||
      websocketUrl.username ||
      websocketUrl.password
    ) {
      throw new Error('The browser returned an unsafe DevTools endpoint.');
    }
    return websocketUrl.toString();
  }
}
