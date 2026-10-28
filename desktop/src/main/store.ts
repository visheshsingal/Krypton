import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import crypto from 'crypto';

interface DesktopStoredData {
  deviceId: string;
  deviceName: string;
  licenseKey?: string;
  token?: string;
  refreshToken?: string;
  user?: any;
  license?: any;
  policy?: any;
  lastHeartbeatAt?: string;
  lastSuccessfulValidation?: string;
  offlineGraceHours?: number;
  usbMonitoringEnabled?: boolean;
}

export class DesktopStore {
  private filePath: string;
  private data: DesktopStoredData;

  constructor() {
    const userDataPath = app ? app.getPath('userData') : path.resolve(__dirname, '../../.krypton-dev-data');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.filePath = path.join(userDataPath, 'krypton-agent-config.json');
    this.data = this.load();
  }

  private load(): DesktopStoredData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[DesktopStore] Failed to read store, initializing defaults:', err);
    }

    // Initialize defaults with persistent hardware-like deviceId
    const deviceId = `${process.platform.toUpperCase()}-AGENT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const defaultData: DesktopStoredData = {
      deviceId,
      deviceName: process.env.COMPUTERNAME || process.env.HOSTNAME || 'Krypton Workstation',
      offlineGraceHours: 72,
      usbMonitoringEnabled: false,
    };
    this.saveData(defaultData);
    return defaultData;
  }

  private saveData(data: DesktopStoredData): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[DesktopStore] Failed to save store:', err);
    }
  }

  public get<K extends keyof DesktopStoredData>(key: K): DesktopStoredData[K] {
    return this.data[key];
  }

  public set<K extends keyof DesktopStoredData>(key: K, value: DesktopStoredData[K]): void {
    this.data[key] = value;
    this.saveData(this.data);
  }

  public getAll(): DesktopStoredData {
    return { ...this.data };
  }

  public clearAuth(): void {
    delete this.data.token;
    delete this.data.refreshToken;
    delete this.data.user;
    delete this.data.license;
    delete this.data.lastSuccessfulValidation;
    this.data.usbMonitoringEnabled = false;
    this.saveData(this.data);
  }
}
