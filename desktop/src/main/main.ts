import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import os from 'os';
import { DesktopStore } from './store';
import { PromptSecurityEngine } from '../engine/scanner';
import { SecurityPolicyDTO } from '@krypton/shared';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const store = new DesktopStore();
const securityEngine = new PromptSecurityEngine();

// Load cached policy if available
const cachedPolicy = store.get('policy');
if (cachedPolicy) {
  securityEngine.updatePolicy(cachedPolicy);
}

let mainWindow: BrowserWindow | null = null;
const configuredBackendUrl = process.env.KRYPTON_API_URL || (isDev ? 'http://localhost:5000/api' : '');

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

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  // Schedule periodic heartbeat check every 30 minutes
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
    try {
      const token = store.get('token');
      if (!token) return { success: false, error: 'Unauthenticated' };

      const res = await fetch(`${getBackendUrl()}/desktop/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...eventData,
          deviceId: store.get('deviceId'),
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as any;
        return { success: false, error: err.error };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Logout
  ipcMain.handle('desktop:logout', () => {
    store.clearAuth();
    return { success: true };
  });
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
      return { valid: false, error: data.message || 'Validation failed' };
    }
  } catch (err: any) {
    console.warn('[DesktopHeartbeat] Heartbeat network check failed, entering offline grace window:', err.message);
    return { valid: true, offline: true, error: err.message };
  }
}
