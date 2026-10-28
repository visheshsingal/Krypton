import { contextBridge, ipcRenderer } from 'electron';

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
  activate: (data: { licenseKey: string; email: string; password: string }) => Promise<any>;
  heartbeat: () => Promise<any>;
  scanPrompt: (prompt: string) => Promise<any>;
  reportEvent: (eventData: any) => Promise<any>;
  logout: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
}

const bridge: KryptonDesktopBridge = {
  getDeviceInfo: () => ipcRenderer.invoke('desktop:get-device-info'),
  getStoredState: () => ipcRenderer.invoke('desktop:get-stored-state'),
  getWebsiteProtectionAvailability: () => ipcRenderer.invoke('desktop:get-website-protection-availability'),
  openProtectedBrowser: (browser, site) => ipcRenderer.invoke('desktop:open-protected-browser', browser, site),
  activate: (data) => ipcRenderer.invoke('desktop:activate', data),
  heartbeat: () => ipcRenderer.invoke('desktop:heartbeat'),
  scanPrompt: (prompt) => ipcRenderer.invoke('desktop:scan-prompt', prompt),
  reportEvent: (eventData) => ipcRenderer.invoke('desktop:report-event', eventData),
  logout: () => ipcRenderer.invoke('desktop:logout'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  getAppVersion: () => ipcRenderer.invoke('desktop:get-version'),
};

contextBridge.exposeInMainWorld('kryptonDesktop', bridge);
