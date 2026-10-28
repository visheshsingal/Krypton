import { contextBridge, ipcRenderer } from 'electron';
import type { UsbMonitorStatus } from './usb-dlp-monitor';

export interface KryptonDesktopBridge {
  getDeviceInfo: () => Promise<any>;
  getStoredState: () => Promise<any>;
  getWebsiteProtectionAvailability: () => Promise<{
    available: boolean;
    status: string;
    platform: string;
    scope?: string;
  }>;
  openProtectedBrowser: (browser: 'chrome' | 'edge', site: string) => Promise<{ success: boolean; error?: string }>;
  createExtensionPairing: (browser: 'chrome' | 'edge') => Promise<{
    success: boolean;
    pairingCode?: string;
    expiresAt?: string;
    error?: string;
  }>;
  downloadBrowserExtension: (browser: 'chrome' | 'edge') => Promise<{
    success: boolean;
    extensionDirectory?: string;
    browserSettingsError?: string;
    error?: string;
  }>;
  copyText: (value: string) => Promise<{ success: boolean }>;
  getExtensionStatus: () => Promise<Record<string, unknown>>;
  getUsbMonitorStatus: () => Promise<UsbMonitorStatus>;
  setUsbMonitoringEnabled: (enabled: boolean) => Promise<{ success: boolean; status?: UsbMonitorStatus; error?: string }>;
  activate: (data: { licenseKey: string; email: string; password: string }) => Promise<any>;
  heartbeat: () => Promise<any>;
  scanPrompt: (prompt: string) => Promise<any>;
  reportEvent: (eventData: any) => Promise<any>;
  logout: () => Promise<{ success: boolean; warning?: string }>;
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{
    supported: boolean;
    currentVersion: string;
    latestVersion?: string;
    updateAvailable: boolean;
    signatureStatus?: string;
  }>;
  installUpdate: () => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
}

const bridge: KryptonDesktopBridge = {
  getDeviceInfo: () => ipcRenderer.invoke('desktop:get-device-info'),
  getStoredState: () => ipcRenderer.invoke('desktop:get-stored-state'),
  getWebsiteProtectionAvailability: () => ipcRenderer.invoke('desktop:get-website-protection-availability'),
  openProtectedBrowser: (browser, site) => ipcRenderer.invoke('desktop:open-protected-browser', browser, site),
  createExtensionPairing: (browser) => ipcRenderer.invoke('desktop:create-extension-pairing', browser),
  downloadBrowserExtension: (browser) => ipcRenderer.invoke('desktop:download-browser-extension', browser),
  copyText: (value) => ipcRenderer.invoke('desktop:copy-text', value),
  getExtensionStatus: () => ipcRenderer.invoke('desktop:get-extension-status'),
  getUsbMonitorStatus: () => ipcRenderer.invoke('desktop:get-usb-monitor-status'),
  setUsbMonitoringEnabled: (enabled) => ipcRenderer.invoke('desktop:set-usb-monitoring', enabled),
  activate: (data) => ipcRenderer.invoke('desktop:activate', data),
  heartbeat: () => ipcRenderer.invoke('desktop:heartbeat'),
  scanPrompt: (prompt) => ipcRenderer.invoke('desktop:scan-prompt', prompt),
  reportEvent: (eventData) => ipcRenderer.invoke('desktop:report-event', eventData),
  logout: () => ipcRenderer.invoke('desktop:logout'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  getAppVersion: () => ipcRenderer.invoke('desktop:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
};

contextBridge.exposeInMainWorld('kryptonDesktop', bridge);
