import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { EndpointEnforcementService } from './endpoint-enforcement';
import { EMPTY_PROXY_SNAPSHOT } from './windows-proxy-settings';

describe('endpoint enforcement', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'krypton-guard-'));
  let appliedPac: string | null = null;
  let currentPac = '';
  let restored = false;

  const service = new EndpointEnforcementService(tempRoot, {
    applyPac: async (pacUrl) => {
      appliedPac = pacUrl;
      currentPac = pacUrl;
    },
    readProxy: async () => ({ autoConfigUrl: currentPac }),
    readSnapshot: async () => EMPTY_PROXY_SNAPSHOT,
    restoreProxy: async () => {
      restored = true;
      currentPac = '';
    },
  });

  afterAll(async () => {
    await service.cleanupForUninstall();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('blocks configured AI hosts on the local PAC listener and leaves other hosts unmatched', async () => {
    const status = await service.sync({
      shouldBlockRegularBrowsers: true,
      policyDomains: ['chatgpt.com'],
      platform: 'win32',
    });
    expect(status.state).toBe('protected');
    expect(status.ready).toBe(true);
    expect(appliedPac).toContain('/proxy.pac');
    expect(service.matchesBlockedHost('chatgpt.com')).toBe(true);
    expect(service.matchesBlockedHost('github.com')).toBe(false);

    const pacUrl = new URL(status.pacUrl!);
    const pac = await fetch(`http://127.0.0.1:${pacUrl.port}/proxy.pac`);
    expect(pac.ok).toBe(true);
    const pacBody = await pac.text();
    expect(pacBody).toContain('chatgpt.com');
    expect(pacBody).toContain('DIRECT');

    const blocked = await fetch(`http://127.0.0.1:${pacUrl.port}/blocked?host=chatgpt.com`);
    expect(blocked.status).toBe(403);
    expect(await blocked.text()).toContain('blocked in regular Chrome/Edge');
  });

  test('clears PAC settings on stop and uninstall cleanup', async () => {
    restored = false;
    await service.stop();
    expect(restored).toBe(true);
    const marker = path.join(tempRoot, 'endpoint-enforcement-state.json');
    await service.cleanupForUninstall();
    expect(fs.existsSync(marker)).toBe(false);
  });

  test('does not overwrite proxy settings changed by another app', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krypton-guard-external-proxy-'));
    let activePac = '';
    let restoreCalled = false;
    const guarded = new EndpointEnforcementService(root, {
      applyPac: async (url) => {
        activePac = url;
      },
      readProxy: async () => ({ autoConfigUrl: activePac }),
      readSnapshot: async () => EMPTY_PROXY_SNAPSHOT,
      restoreProxy: async () => {
        restoreCalled = true;
      },
    });

    await guarded.sync({ shouldBlockRegularBrowsers: true, platform: 'win32' });
    activePac = 'https://proxy.example/proxy.pac';
    await guarded.stop();
    expect(restoreCalled).toBe(false);
    expect(activePac).toBe('https://proxy.example/proxy.pac');
    expect(fs.existsSync(path.join(root, 'endpoint-enforcement-state.json'))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('recovers the saved proxy snapshot after an unclean shutdown', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krypton-guard-recovery-'));
    const markerPath = path.join(root, 'endpoint-enforcement-state.json');
    const snapshot = { ...EMPTY_PROXY_SNAPSHOT, proxyServer: 'proxy.example:8080', proxyEnable: '1' };
    fs.writeFileSync(markerPath, JSON.stringify({
      previousProxy: snapshot,
      pacUrl: 'http://127.0.0.1:12345/proxy.pac',
    }));
    let restoredSnapshot: typeof snapshot | null = null;
    const recovering = new EndpointEnforcementService(root, {
      readProxy: async () => ({ autoConfigUrl: 'http://127.0.0.1:12345/proxy.pac' }),
      restoreProxy: async (value) => {
        restoredSnapshot = value;
      },
    });

    await recovering.recoverStaleProxy();
    expect(restoredSnapshot).toEqual(snapshot);
    expect(fs.existsSync(markerPath)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('reports Not Protected instead of ready when the listener cannot be treated as online', () => {
    const cold = new EndpointEnforcementService(tempRoot);
    const status = cold.getStatus({
      licenseValid: true,
      policyValid: true,
      scheduleActive: true,
      platform: 'win32',
    });
    expect(status.ready).toBe(false);
    expect(status.state).toBe('enforcement_unavailable');
    expect(status.failClosed).toBe(true);
  });

  test('fails closed when cached policy is expired', () => {
    const status = service.getStatus({
      licenseValid: true,
      policyValid: false,
      scheduleActive: true,
      platform: 'win32',
    });
    expect(status.state).toBe('policy_expired');
    expect(status.ready).toBe(false);
    expect(status.failClosed).toBe(true);
  });

  test('does not claim Windows regular-browser blocking on other platforms', async () => {
    const status = await service.sync({
      shouldBlockRegularBrowsers: true,
      platform: 'darwin',
    });
    expect(status.state).toBe('enforcement_unavailable');
    expect(status.ready).toBe(false);
  });
});

describe('HTTPS CONNECT fail-closed', () => {
  test('rejects CONNECT tunnels to the local enforcement port', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'krypton-guard-connect-'));
    const service = new EndpointEnforcementService(tempRoot, {
      applyPac: async () => undefined,
      readProxy: async () => ({ autoConfigUrl: '' }),
      readSnapshot: async () => EMPTY_PROXY_SNAPSHOT,
      restoreProxy: async () => undefined,
    });
    const status = await service.sync({
      shouldBlockRegularBrowsers: true,
      policyDomains: ['chatgpt.com'],
      platform: 'win32',
    });
    const port = Number(new URL(status.pacUrl!).port);
    try {
      const response = await new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        method: 'CONNECT',
        path: 'chatgpt.com:443',
      });
      req.on('connect', (res, socket, head) => {
        resolve({ statusCode: res.statusCode, body: Buffer.from(head).toString('utf8') });
        socket.destroy();
      });
      req.on('error', reject);
      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      req.end();
      });
      expect(response.statusCode).toBe(403);
      expect(response.body.toLowerCase()).toContain('blocked in regular chrome/edge');
    } finally {
      await service.cleanupForUninstall();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
