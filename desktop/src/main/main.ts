import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import os from 'os';
import { DesktopStore } from './store';
import { PromptSecurityEngine } from '../engine/scanner';
import { SecurityPolicyDTO } from '@krypton/shared';
import {
  findManagedBrowserExecutable,
  isManagedBrowserKind,
  ManagedBrowserKind,
  ManagedBrowserSession,
} from './managed-browser';
import {
  createBlockedPromptEvent,
  getOfflineProtectionState,
  isProtectedAiSite,
  PROTECTED_AI_SITES,
} from './protected-browser-policy';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const store = new DesktopStore();
const securityEngine = new PromptSecurityEngine();

// Load cached policy if available
const cachedPolicy = store.get('policy');
if (cachedPolicy) {
  securityEngine.updatePolicy(cachedPolicy);
}

let mainWindow: BrowserWindow | null = null;
const managedBrowserSessions = new Map<ManagedBrowserKind, ManagedBrowserSession>();
const browserEventTimes = new Map<ManagedBrowserKind, number[]>();
let shuttingDown = false;
const productionBackendUrl = 'https://krypton-ten-theta.vercel.app/api';
const configuredBackendUrl = process.env.KRYPTON_API_URL || (isDev ? 'http://localhost:5000/api' : productionBackendUrl);

function getBackendUrl(): string {
  if (!configuredBackendUrl) {
    throw new Error('Production API is not configured. Set KRYPTON_API_URL to the deployed HTTPS API URL.');
  }

  const url = new URL(configuredBackendUrl);
  if (url.protocol !== 'https:' && !(isDev && url.protocol === 'http:')) {
    throw new Error('The desktop app requires HTTPS for API communication.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('KRYPTON_API_URL must not contain credentials, a query string, or a fragment.');
  }

  return url.toString().replace(/\/+$/, '');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    title: 'Krypton AI Security & Data Governance Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  // Restrict navigation to prevent arbitrary web redirection
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getProtectionAvailability() {
  const license = store.get('license');
  const token = store.get('token');
  const lastValidation = store.get('lastSuccessfulValidation');
  const graceHours = store.get('offlineGraceHours') || 72;
  const hasActiveLicense = Boolean(
    token &&
    license?.status === 'active' &&
    license.expiresAt &&
    Date.parse(license.expiresAt) > Date.now()
  );
  const graceState = getOfflineProtectionState(lastValidation, graceHours);

  if (process.platform !== 'win32') {
    return { available: false, status: 'windows_only', platform: process.platform, browsers: [] as ManagedBrowserKind[] };
  }
  if (!hasActiveLicense) {
    return { available: false, status: 'activation_required', platform: process.platform, browsers: [] as ManagedBrowserKind[] };
  }
  if (graceState !== 'valid') {
    return { available: false, status: 'license_validation_required', platform: process.platform, browsers: [] as ManagedBrowserKind[] };
  }

  const browsers = (['chrome', 'edge'] as const).filter((browser) =>
    Boolean(findManagedBrowserExecutable(browser))
  );
  if (browsers.length === 0) {
    return { available: false, status: 'browser_not_installed', platform: process.platform, browsers };
  }

  return {
    available: true,
    status: 'protected_browser_available',
    platform: process.platform,
    scope: 'krypton_managed_browser_profile_only',
    browsers,
  };
}

async function openProtectedBrowser(browserValue: unknown, siteValue: unknown) {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Managed Chrome/Edge protection is currently available on Windows only.' };
  }
  if (!isManagedBrowserKind(browserValue)) {
    return { success: false, error: 'Choose Google Chrome or Microsoft Edge.' };
  }
  if (!isProtectedAiSite(siteValue)) {
    return { success: false, error: 'Choose a supported AI website.' };
  }

  const heartbeat = await performBackgroundHeartbeat();
  if (!heartbeat.valid) {
    return { success: false, error: 'Krypton could not validate this license. Reconnect and try again.' };
  }

  const availability = getProtectionAvailability();
  if (!availability.available) {
    return { success: false, error: 'Activate a valid license and reconnect to Krypton before using protected browsing.' };
  }

  if (!findManagedBrowserExecutable(browserValue)) {
    return { success: false, error: `${browserValue === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'} is not installed.` };
  }

  let browserSession = managedBrowserSessions.get(browserValue);
  try {
    if (!browserSession) {
      browserSession = await ManagedBrowserSession.launch({
        browser: browserValue,
        profileRoot: path.join(app.getPath('userData'), 'protected-browser-profiles'),
        scanner: securityEngine,
        onBlocked: (result, hostname) => reportBrowserBlock(browserValue, result, hostname),
      });
      managedBrowserSessions.set(browserValue, browserSession);
    }

    await browserSession.openUrl(PROTECTED_AI_SITES[siteValue].url);
    return { success: true };
  } catch (error) {
    managedBrowserSessions.delete(browserValue);
    await browserSession?.close();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Could not connect Krypton to the selected browser.',
    };
  }
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  // Schedule periodic heartbeat check every 30 minutes
  if (store.get('token')) void performBackgroundHeartbeat();
  setInterval(() => {
    performBackgroundHeartbeat();
  }, 30 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void closeManagedBrowserSessions().finally(() => app.quit());
});

function setupIpcHandlers() {
  // Device info
  ipcMain.handle('desktop:get-device-info', () => {
    return {
      deviceId: store.get('deviceId'),
      deviceName: store.get('deviceName') || os.hostname(),
      platform: process.platform,
      osVersion: `${os.type()} ${os.release()}`,
      appVersion: app.getVersion(),
    };
  });

  // Stored state
  ipcMain.handle('desktop:get-stored-state', () => {
    return store.getAll();
  });

  ipcMain.handle('desktop:get-website-protection-availability', () => getProtectionAvailability());
  ipcMain.handle('desktop:open-protected-browser', (_event, browser: unknown, site: unknown) =>
    openProtectedBrowser(browser, site)
  );

  // Version
  ipcMain.handle('desktop:get-version', () => app.getVersion());

  // External link
  ipcMain.handle('desktop:open-external', (_, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
  });

  // Prompt scanning (local engine evaluation)
  ipcMain.handle('desktop:scan-prompt', (_, prompt: string) => {
    // Check offline grace period
    const lastValid = store.get('lastSuccessfulValidation');
    const graceHours = store.get('offlineGraceHours') || 72;
    if (lastValid) {
      const elapsedHours = (Date.now() - new Date(lastValid).getTime()) / (1000 * 60 * 60);
      if (elapsedHours > graceHours) {
        return {
          hasRisk: true,
          highestRisk: 'CRITICAL',
          action: 'block',
          matches: [],
          redactedPrompt: prompt,
          explanation: `Offline grace period (${graceHours} hours) has expired without server contact. Prompt submission is locked until license re-validation.`,
        };
      }
    }

    return securityEngine.scan(prompt);
  });

  // Activation with backend
  ipcMain.handle('desktop:activate', async (_, { licenseKey, email, password }) => {
    try {
      const payload = {
        licenseKey: licenseKey.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        password,
        deviceId: store.get('deviceId'),
        deviceName: store.get('deviceName') || os.hostname(),
        platform: process.platform,
        osVersion: `${os.type()} ${os.release()}`,
        appVersion: app.getVersion(),
      };

      const res = await fetch(`${getBackendUrl()}/desktop/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, error: data.error || 'Activation failed' };
      }

      // Store credentials & policy
      store.set('licenseKey', licenseKey);
      store.set('token', data.token);
      store.set('refreshToken', data.refreshToken);
      store.set('user', data.user);
      store.set('license', data.license);
      store.set('policy', data.policy);
      store.set('lastSuccessfulValidation', new Date().toISOString());
      if (data.license?.offlineGraceHours) {
        store.set('offlineGraceHours', data.license.offlineGraceHours);
      }

      if (data.policy) {
        securityEngine.updatePolicy(data.policy);
      }

      return { success: true, ...data };
    } catch (err: any) {
      return { success: false, error: `Could not reach server: ${err.message}` };
    }
  });

  // Heartbeat check-in
  ipcMain.handle('desktop:heartbeat', async () => {
    return performBackgroundHeartbeat();
  });

  // Report security incident to backend
  ipcMain.handle('desktop:report-event', async (_, eventData) => {
    return reportDesktopEvent({
      ...eventData,
      deviceId: store.get('deviceId'),
    });
  });

  // Logout
  ipcMain.handle('desktop:logout', async () => {
    store.clearAuth();
    await closeManagedBrowserSessions();
    return { success: true };
  });
}

function reportBrowserBlock(
  browser: ManagedBrowserKind,
  result: import('@krypton/shared').PromptScanResult,
  hostname: string,
): void {
  const now = Date.now();
  const recent = (browserEventTimes.get(browser) || [])
    .filter((timestamp) => now - timestamp < 10 * 60 * 1000);
  if (recent.length >= 20) return;
  recent.push(now);
  browserEventTimes.set(browser, recent);

  const report = createBlockedPromptEvent(
    result.action === 'block' ? result : { ...result, action: 'block' },
    hostname,
  );
  if (report) {
    void reportDesktopEvent({
      ...report,
      deviceId: store.get('deviceId'),
    });
  }
}

async function closeManagedBrowserSessions(): Promise<void> {
  const sessions = Array.from(managedBrowserSessions.values());
  managedBrowserSessions.clear();
  await Promise.all(sessions.map(async (session) => {
    try {
      await session.close();
    } catch (error) {
      console.warn('[ProtectedBrowser] Could not close managed browser cleanly:', error);
    }
  }));
}

async function reportDesktopEvent(eventData: Record<string, unknown>) {
    try {
      const token = store.get('token');
      if (!token) return { success: false, error: 'Unauthenticated' };

      const res = await fetch(`${getBackendUrl()}/desktop/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(eventData),
      });

      if (!res.ok) {
        const err = (await res.json()) as any;
        return { success: false, error: err.error };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
}

async function performBackgroundHeartbeat() {
  const token = store.get('token');
  const deviceId = store.get('deviceId');
  if (!token || !deviceId) return { valid: false, error: 'Not activated' };

  try {
    const res = await fetch(`${getBackendUrl()}/desktop/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        deviceId,
        appVersion: app.getVersion(),
      }),
    });

    const data = (await res.json()) as any;
    if (res.ok && data.valid) {
      store.set('lastSuccessfulValidation', new Date().toISOString());
      if (data.policy) {
        store.set('policy', data.policy);
        securityEngine.updatePolicy(data.policy);
      }
      return { valid: true, ...data };
    } else {
      console.warn('[DesktopHeartbeat] Heartbeat validation failed:', data);
      await closeManagedBrowserSessions();
      return { valid: false, error: data.message || 'Validation failed' };
    }
  } catch (err: any) {
    console.warn('[DesktopHeartbeat] Heartbeat network check failed, entering offline grace window:', err.message);
    const protectionAvailable = getProtectionAvailability().available;
    if (!protectionAvailable) await closeManagedBrowserSessions();
    return { valid: protectionAvailable, offline: true, error: err.message };
  }
}
