import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, Eye, EyeOff, HardDrive, KeyRound, LogOut, RefreshCw, Shield, ShieldCheck } from 'lucide-react';

type DesktopState = {
  license?: string;
  token?: string;
  user?: {
    name?: string;
    email?: string;
  };
  usbMonitoringEnabled?: boolean;
};

type UsbMonitorStatus = {
  enabled: boolean;
  active: boolean;
  platform: string;
  connectedDevices: number;
  lastEventAt: string | null;
  error: string | null;
};

type ActivationResult = {
  success: boolean;
  error?: string;
};

type BrowserExtensionStatus = {
  status: string;
  installed: boolean;
  connected: boolean;
  protectionActive: boolean;
  browser?: 'chrome' | 'edge' | null;
  lastConnectedAt?: string | null;
  error?: string;
};

type WebsiteProtectionAvailability = {
  available: boolean;
  status: string;
  platform: string;
  browsers: Array<'chrome' | 'edge'>;
};

type KryptonDesktopBridge = {
  getDeviceInfo: () => Promise<{ deviceId?: string; deviceName?: string; osVersion?: string; appVersion?: string; platform?: string }>;
  getStoredState: () => Promise<DesktopState | null>;
  getUsbMonitorStatus: () => Promise<UsbMonitorStatus>;
  setUsbMonitoringEnabled: (enabled: boolean) => Promise<{ success: boolean; status?: UsbMonitorStatus; error?: string }>;
  getWebsiteProtectionAvailability: () => Promise<WebsiteProtectionAvailability>;
  openProtectedBrowser: (
    browser: 'chrome' | 'edge',
    site: string,
  ) => Promise<{ success: boolean; error?: string }>;
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
  getExtensionStatus: () => Promise<BrowserExtensionStatus>;
  activate: (data: { licenseKey: string; email: string; password: string }) => Promise<ActivationResult>;
  logout: () => Promise<{ success: boolean; warning?: string }>;
  openExternal: (url: string) => Promise<void>;
  checkForUpdates: () => Promise<{
    supported: boolean;
    currentVersion: string;
    latestVersion?: string;
    updateAvailable: boolean;
    signatureStatus?: string;
  }>;
  installUpdate: () => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
};

const desktopBridge = (window as Window & { kryptonDesktop?: KryptonDesktopBridge }).kryptonDesktop;

export default function App() {
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId?: string; deviceName?: string; osVersion?: string; platform?: string } | null>(null);
  const [storedState, setStoredState] = useState<DesktopState | null>(null);
  const [usbStatus, setUsbStatus] = useState<UsbMonitorStatus | null>(null);
  const [usbLoading, setUsbLoading] = useState(false);
  const [usbError, setUsbError] = useState<string | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<BrowserExtensionStatus | null>(null);
  const [protectionAvailability, setProtectionAvailability] = useState<WebsiteProtectionAvailability | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [selectedBrowser, setSelectedBrowser] = useState<'chrome' | 'edge'>('chrome');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [extensionError, setExtensionError] = useState<string | null>(null);
  const [extensionDownloadLoading, setExtensionDownloadLoading] = useState(false);
  const [extensionDownloadMessage, setExtensionDownloadMessage] = useState<string | null>(null);
  const [extensionDirectory, setExtensionDirectory] = useState<string | null>(null);
  const [selectedAiSite, setSelectedAiSite] = useState('chatgpt');
  const [protectedBrowserLoading, setProtectedBrowserLoading] = useState(false);
  const [protectedBrowserMessage, setProtectedBrowserMessage] = useState<string | null>(null);
  const [protectedBrowserError, setProtectedBrowserError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<Awaited<ReturnType<KryptonDesktopBridge['checkForUpdates']>> | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!desktopBridge) {
      setIsInitializing(false);
      return;
    }

    Promise.all([
      desktopBridge.getDeviceInfo(),
      desktopBridge.getStoredState(),
      desktopBridge.getUsbMonitorStatus(),
    ])
      .then(([device, state, usb]) => {
        setDeviceInfo(device);
        setStoredState(state);
        setUsbStatus(usb);
        setIsActivated(Boolean(state?.license && state?.token));
      })
      .catch((error: unknown) => {
        console.error('Failed to load activation state:', error);
        setActivationError('Could not load the saved activation. Restart the app and try again.');
      })
      .finally(() => setIsInitializing(false));
  }, []);

  useEffect(() => {
    if (!isActivated || !desktopBridge) return;
    let active = true;
    const refreshStatus = async () => {
      try {
        const status = await desktopBridge.getExtensionStatus();
        const availability = await desktopBridge.getWebsiteProtectionAvailability();
        if (active) {
          setExtensionStatus(status);
          setProtectionAvailability(availability);
          if (status.protectionActive) setPairingCode(null);
        }
      } catch (error) {
        if (active) {
          setExtensionStatus({
            status: 'unavailable',
            installed: false,
            connected: false,
            protectionActive: false,
            error: error instanceof Error ? error.message : 'Could not load extension status.',
          });
        }
      }
    };
    void refreshStatus();
    const interval = window.setInterval(refreshStatus, pairingCode ? 10_000 : 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isActivated, pairingCode]);

  useEffect(() => {
    if (!isActivated || !desktopBridge) return;
    let active = true;
    const refreshUsbStatus = async () => {
      try {
        const status = await desktopBridge.getUsbMonitorStatus();
        if (active) setUsbStatus(status);
      } catch (error) {
        if (active) setUsbError(error instanceof Error ? error.message : 'Could not load USB monitoring status.');
      }
    };
    void refreshUsbStatus();
    const interval = window.setInterval(refreshUsbStatus, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isActivated]);

  useEffect(() => {
    if (!desktopBridge || deviceInfo?.platform !== 'win32') return;
    let active = true;
    void desktopBridge.checkForUpdates()
      .then((result) => {
        if (active) setUpdateInfo(result);
      })
      .catch((error: unknown) => {
        if (active) setUpdateError(error instanceof Error ? error.message : 'Could not check for updates.');
      });
    return () => {
      active = false;
    };
  }, [deviceInfo?.platform]);

  async function handleCheckForUpdates() {
    if (!desktopBridge) return;
    setUpdateChecking(true);
    setUpdateError(null);
    setUpdateMessage(null);
    try {
      const result = await desktopBridge.checkForUpdates();
      setUpdateInfo(result);
      if (!result.supported) {
        setUpdateMessage('In-app updates are available in the installed Windows version.');
      } else if (!result.updateAvailable) {
        setUpdateMessage('You’re using the latest version.');
      }
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Could not check for updates.');
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handleInstallUpdate() {
    if (!desktopBridge) return;
    setUpdateInstalling(true);
    setUpdateError(null);
    setUpdateMessage('Downloading and verifying the update…');
    try {
      const result = await desktopBridge.installUpdate();
      if (result.error) {
        setUpdateError(result.error);
        setUpdateMessage(null);
      } else if (result.cancelled) {
        setUpdateMessage(null);
      }
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Could not install the update.');
      setUpdateMessage(null);
    } finally {
      setUpdateInstalling(false);
    }
  }

  async function handleOpenProtectedAiSite() {
    if (!desktopBridge) return;
    setProtectedBrowserLoading(true);
    setProtectedBrowserError(null);
    setProtectedBrowserMessage(null);
    try {
      const result = await desktopBridge.openProtectedBrowser(selectedBrowser, selectedAiSite);
      if (!result.success) {
        setProtectedBrowserError(result.error || 'Could not open the protected AI website.');
        return;
      }

      async function handleUsbMonitoringChange(enabled: boolean) {
        if (!desktopBridge) return;
        setUsbLoading(true);
        setUsbError(null);
        try {
          const result = await desktopBridge.setUsbMonitoringEnabled(enabled);
          if (result.status) setUsbStatus(result.status);
          if (!enabled) {
            setStoredState((state) => state ? { ...state, usbMonitoringEnabled: false } : state);
          }
          if (!result.success) {
            setUsbError(result.error || 'Could not change USB monitoring.');
            return;
          }
          setStoredState((state) => state ? { ...state, usbMonitoringEnabled: enabled } : state);
        } catch (error) {
          setUsbError(error instanceof Error ? error.message : 'Could not change USB monitoring.');
        } finally {
          setUsbLoading(false);
        }
      }
      const appName = selectedAiSite === 'chatgpt' ? 'ChatGPT' :
        selectedAiSite === 'copilot' ? 'Copilot' :
          selectedAiSite === 'claude' ? 'Claude' :
            selectedAiSite === 'gemini' ? 'Gemini' : 'Perplexity';
      setProtectedBrowserMessage(`${appName} opened in the Krypton-managed ${selectedBrowser === 'chrome' ? 'Chrome' : 'Edge'} profile.`);
    } catch (error) {
      setProtectedBrowserError(error instanceof Error ? error.message : 'Could not open the protected AI website.');
    } finally {
      setProtectedBrowserLoading(false);
    }
  }

  async function handleActivate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!desktopBridge) return;

    setActivationLoading(true);
    setActivationError(null);
    try {
      const result = await desktopBridge.activate({
        licenseKey: licenseKeyInput.trim(),
        email: emailInput.trim(),
        password: passwordInput,
      });

      if (!result.success) {
        setActivationError(result.error || 'Activation failed. Check your account and license details.');
        return;
      }

      const state = await desktopBridge.getStoredState();
      setStoredState(state);
      setIsActivated(true);
      setExtensionStatus(await desktopBridge.getExtensionStatus());
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : 'Could not connect to the activation service.');
    } finally {
      setActivationLoading(false);
    }
  }

  async function handleLogout() {
    if (!desktopBridge) return;
    try {
      const result = await desktopBridge.logout();
      setStoredState(null);
      setIsActivated(false);
      setUsbStatus(null);
      setPairingCode(null);
      setExtensionStatus(null);
      setActivationError(result.warning || null);
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : 'Could not log out.');
    }
  }

  async function handleCreatePairingCode() {
    if (!desktopBridge) return;
    setPairingLoading(true);
    setExtensionError(null);
    setPairingCode(null);
    try {
      const result = await desktopBridge.createExtensionPairing(selectedBrowser);
      if (!result.success || !result.pairingCode || !result.expiresAt) {
        setExtensionError(result.error || 'Could not create an activation code.');
        return;
      }

      async function handleDownloadExtension() {
        if (!desktopBridge) return;
        setExtensionDownloadLoading(true);
        setExtensionDownloadMessage(null);
        setExtensionError(null);
        try {
          const result = await desktopBridge.downloadBrowserExtension(selectedBrowser);
          if (!result.success) {
            setExtensionError(result.error || 'Could not download the extension package.');
            return;
          }
          setExtensionDirectory(result.extensionDirectory || null);
          setExtensionDownloadMessage(
            result.browserSettingsError
              ? `Extension extracted, but could not open browser settings: ${result.browserSettingsError}`
              : `Extension extracted. ${selectedBrowser === 'chrome' ? 'Chrome' : 'Edge'} extensions page opened.`,
          );
        } catch (error) {
          setExtensionError(error instanceof Error ? error.message : 'Could not download the extension package.');
        } finally {
          setExtensionDownloadLoading(false);
        }
      }
      setPairingCode(result.pairingCode);
      setPairingExpiresAt(result.expiresAt);
    } catch (error) {
      setExtensionError(error instanceof Error ? error.message : 'Could not create an activation code.');
    } finally {
      setPairingLoading(false);
    }
  }

  if (!desktopBridge) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b14] p-6 text-slate-100">
        <div className="max-w-md rounded-2xl border border-slate-800/80 bg-[#0b1220] p-7 text-center shadow-2xl">
          <h1 className="text-lg font-semibold text-white">Krypton desktop runtime unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">Activation is available in the installed desktop application.</p>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[#070b14] text-sm text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
        Connecting to Krypton…
      </div>
    );
  }

  if (!isActivated) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070b14] p-6 text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(14,165,233,0.12),transparent_58%)]" />
        <div className="relative w-full max-w-md rounded-2xl border border-slate-800/80 bg-[#0b1220]/95 p-8 shadow-[0_24px_100px_rgba(2,132,199,0.12)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-2.5">
              <Shield className="h-7 w-7 text-sky-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Krypton Security</h1>
              <p className="text-xs text-slate-400">Activate your account</p>
            </div>
          </div>

          <div className="mb-6 space-y-1 rounded-lg border border-slate-700/60 bg-slate-800/60 p-3.5 text-xs text-slate-300">
            <p><span className="text-slate-400">Device:</span> {deviceInfo?.deviceName || 'This computer'}</p>
            <p><span className="text-slate-400">Platform:</span> {deviceInfo?.osVersion || 'Desktop OS'}</p>
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label htmlFor="license-key" className="mb-1 block text-xs font-medium text-slate-300">Company license key</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="license-key"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="KRYP-XXXX-XXXX-XXXX-XXXX"
                  value={licenseKeyInput}
                  onChange={(event) => setLicenseKeyInput(event.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="account-email" className="mb-1 block text-xs font-medium text-slate-300">Work email</label>
              <input
                id="account-email"
                type="email"
                required
                autoComplete="username"
                placeholder="employee@company.com"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="account-password" className="mb-1 block text-xs font-medium text-slate-300">Account password</label>
              <div className="relative">
                <input
                  id="account-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-10 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {activationError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-800/80 bg-red-950/50 p-3 text-xs text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{activationError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={activationLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-300 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {activationLoading ? 'Activating…' : 'Activate'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Ask your company administrator for your account and license key.
          </p>
          {deviceInfo?.platform === 'win32' && (
            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  Version {updateInfo?.currentVersion || deviceInfo.appVersion || '—'}
                  {updateInfo?.updateAvailable && updateInfo.latestVersion ? ` · ${updateInfo.latestVersion} available` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => void (updateInfo?.updateAvailable ? handleInstallUpdate() : handleCheckForUpdates())}
                  disabled={updateChecking || updateInstalling}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-400/20 disabled:opacity-50"
                >
                  {updateChecking || updateInstalling
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : updateInfo?.updateAvailable
                      ? <Download className="h-3.5 w-3.5" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                  {updateChecking ? 'Checking…' : updateInstalling ? 'Downloading…' : updateInfo?.updateAvailable ? 'Update now' : 'Check for updates'}
                </button>
              </div>
              {updateMessage && <p role="status" className="mt-2 text-[11px] text-emerald-300">{updateMessage}</p>}
              {updateError && <p role="alert" className="mt-2 text-[11px] text-rose-300">{updateError}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/80 bg-[#0b1220]/90 px-5 py-3.5 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
          <Shield className="h-5 w-5" />
          </div>
          <div>
          <h1 className="text-sm font-semibold tracking-tight text-white">Krypton</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Protection workspace
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right text-xs sm:block">
          <p className="font-medium text-slate-200">{storedState?.user?.name || 'Employee'}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{storedState?.user?.email || 'Activated user'}</p>
        </div>
        <button
          onClick={handleLogout}
          title="Log out"
          className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-2 text-xs text-slate-400 transition hover:border-rose-400/20 hover:bg-rose-400/5 hover:text-rose-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>

    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1220] shadow-[0_24px_100px_rgba(2,132,199,0.08)]">
        <div className="border-b border-slate-800/80 bg-gradient-to-r from-sky-400/[0.08] to-transparent px-5 py-5 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10">
            <ShieldCheck className="h-6 w-6 text-sky-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-white">Browser protection</h2>
              <p className="mt-1 text-xs text-slate-400">Connect Krypton to Chrome or Edge</p>
            </div>
          </div>
        </div>

        <div className="mx-5 mt-5 rounded-xl border border-slate-800 bg-[#080e19] p-4 sm:mx-7">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Extension status</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                extensionStatus?.protectionActive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : extensionStatus?.status === 'license_invalid' || extensionStatus?.status === 'revoked'
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-amber-500/15 text-amber-200'
              }`}>
                {extensionStatus?.protectionActive
                  ? 'Protection Active'
                  : extensionStatus?.status === 'connected'
                    ? 'Connected'
                    : extensionStatus?.status === 'installed'
                      ? 'Installed · Not Activated'
                      : extensionStatus?.status === 'license_invalid'
                        ? 'License Invalid'
                        : extensionStatus?.status === 'revoked'
                          ? 'Access Revoked'
                          : extensionStatus?.status === 'unavailable'
                            ? 'Status Unavailable'
                            : 'Not Installed'}
              </span>
            </div>
            {extensionStatus?.lastConnectedAt && (
              <p className="mt-2 text-[11px] text-slate-500">
                Last connected: {new Date(extensionStatus.lastConnectedAt).toLocaleString()}
              </p>
            )}
            {extensionStatus?.error && (
              <p role="alert" className="mt-2 text-xs text-amber-200">{extensionStatus.error}</p>
            )}
          </div>

          <div className="mx-5 mt-4 rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-4 sm:mx-7">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-300/15 bg-sky-300/10">
                <ShieldCheck className="h-4 w-4 text-sky-200" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">Protected AI websites</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Open ChatGPT, Copilot, Claude, Gemini, or Perplexity in a separate Krypton-managed browser profile.
                  Recognized prompt requests are scanned locally before they are sent.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="block text-xs font-medium text-slate-300">
                AI website
                <select
                  value={selectedAiSite}
                  onChange={(event) => setSelectedAiSite(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
                >
                  <option value="chatgpt">ChatGPT web</option>
                  <option value="copilot">Copilot web</option>
                  <option value="claude">Claude web</option>
                  <option value="gemini">Gemini web</option>
                  <option value="perplexity">Perplexity web</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-300">
                Browser
                <select
                  value={selectedBrowser}
                  onChange={(event) => setSelectedBrowser(event.target.value as 'chrome' | 'edge')}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
                >
                  <option value="chrome">Google Chrome</option>
                  <option value="edge">Microsoft Edge</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleOpenProtectedAiSite()}
                disabled={protectedBrowserLoading || protectionAvailability?.available === false}
                className="self-end rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {protectedBrowserLoading ? 'Opening…' : 'Open protected'}
              </button>
            </div>
            {protectionAvailability?.available === false && (
              <p className="mt-3 text-xs text-amber-200">
                Protected browsing is unavailable ({protectionAvailability.status.replaceAll('_', ' ')}).
                Use Windows with an active license and Chrome or Edge installed.
              </p>
            )}
            {protectedBrowserMessage && <p role="status" className="mt-3 text-xs text-emerald-300">{protectedBrowserMessage}</p>}
            {protectedBrowserError && <p role="alert" className="mt-3 text-xs text-rose-300">{protectedBrowserError}</p>}
            <p className="mt-3 border-t border-slate-800/80 pt-3 text-[11px] leading-5 text-slate-500">
              Only known supported web request endpoints are inspected; provider changes or unrecognized submission routes may not be covered.
            </p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Standalone ChatGPT/Copilot desktop apps and other desktop applications are not protected. They do not expose a supported
              pre-submit scanning interface; Krypton does not monitor keystrokes, clipboard contents, or unrelated app input.
            </p>
          </div>

          <div className="space-y-4 px-5 pb-6 pt-5 sm:px-7">
            <button
              type="button"
              onClick={() => void handleDownloadExtension()}
              disabled={extensionDownloadLoading}
              className="w-full rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"
            >
              {extensionDownloadLoading ? 'Preparing browser extension…' : 'Prepare extension in selected browser'}
            </button>
            {extensionDownloadMessage && (
              <p role="status" className="text-xs text-emerald-300">{extensionDownloadMessage}</p>
            )}
            <ol className="grid gap-2 text-xs leading-5 text-slate-400 sm:grid-cols-3">
              <li className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-sky-300">01 · Prepare</span>
                Download and verify the extension package automatically.
              </li>
              <li className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-sky-300">02 · Add to browser</span>
                Enable Developer mode, choose “Load unpacked”, and select the folder below.
              </li>
              <li className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-sky-300">03 · Connect</span>
                Generate a one-time code and enter it in the extension popup.
              </li>
            </ol>
            {extensionDirectory && (
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                <p className="mb-1 text-[11px] text-slate-500">Choose this folder in “Load unpacked”:</p>
                <code className="block break-all text-xs text-sky-200">{extensionDirectory}</code>
                <button
                  type="button"
                  onClick={() => void desktopBridge.copyText(extensionDirectory)}
                  className="mt-2 text-xs font-medium text-sky-300 hover:text-sky-100"
                >
                  Copy folder path
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleCreatePairingCode()}
              disabled={pairingLoading}
              className="w-full rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-wait disabled:opacity-50"
            >
              {pairingLoading ? 'Generating…' : 'Generate one-time activation code'}
            </button>
            {pairingCode && pairingExpiresAt && (
              <div className="rounded-lg border border-sky-300/20 bg-sky-400/[0.06] p-4 text-center">
                <p className="text-xs text-slate-300">Enter this code in the extension popup</p>
                <p className="my-2 font-mono text-2xl font-bold tracking-[0.2em] text-sky-200">{pairingCode}</p>
                <p className="text-[11px] text-slate-500">
                  Expires {new Date(pairingExpiresAt).toLocaleTimeString()}
                </p>
              </div>
            )}
            {extensionError && <p role="alert" className="text-xs text-red-300">{extensionError}</p>}
            <p className="text-[11px] leading-5 text-slate-500">
              Prompt contents are scanned locally. Only redacted event metadata is sent. Protection applies to supported AI sites in this managed browser profile.
            </p>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1220]">
          <div className="border-b border-slate-800/80 px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10">
                <HardDrive className="h-5 w-5 text-sky-200" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">USB activity monitoring</h2>
                <p className="mt-1 text-xs text-slate-400">Optional · Windows removable drives only</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-5 sm:p-7">
            <p className="text-xs leading-5 text-slate-400">
              If enabled, Krypton reports USB drive connections and metadata for files created or changed on those drives:
              file name, extension, size, time, and destination. File contents are never read or uploaded.
              Windows does not expose a reliable source path or verified copy-completion signal to this unprivileged monitor.
            </p>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4">
              <input
                type="checkbox"
                checked={storedState?.usbMonitoringEnabled === true}
                onChange={(event) => void handleUsbMonitoringChange(event.target.checked)}
                disabled={usbLoading || (deviceInfo?.platform !== 'win32' && usbStatus?.platform !== 'win32')}
                className="mt-0.5 h-4 w-4 accent-sky-400"
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">I agree to enable USB activity monitoring on this device</span>
                <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                  Your company administrator can view the reported metadata. You can turn this off at any time here.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={`inline-flex items-center gap-2 ${usbStatus?.active ? 'text-emerald-300' : 'text-slate-400'}`}>
                <span className={`h-2 w-2 rounded-full ${usbStatus?.active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {usbLoading ? 'Updating…' : usbStatus?.active
                  ? `Monitoring active · ${usbStatus.connectedDevices} removable drive(s)`
                  : storedState?.usbMonitoringEnabled ? 'Consented · waiting for a validated connection' : 'Monitoring off'}
              </span>
              {usbStatus?.lastEventAt && (
                <span className="text-[11px] text-slate-500">Last event {new Date(usbStatus.lastEventAt).toLocaleString()}</span>
              )}
            </div>
            {usbError && <p role="alert" className="text-xs text-rose-300">{usbError}</p>}
            {usbStatus?.error && <p role="alert" className="text-xs text-amber-200">{usbStatus.error}</p>}
            {deviceInfo?.platform !== 'win32' && (
              <p className="text-[11px] leading-5 text-amber-200">This feature is currently supported on Windows only.</p>
            )}
            <p className="text-[11px] leading-5 text-slate-500">
              Monitoring uses Windows removable-drive metadata and directory notifications only. It does not use keyboard hooks,
              clipboard capture, administrator privileges, or a kernel driver. A destination write is an observation, not proof that a transfer completed.
            </p>
          </div>
        </section>

        {deviceInfo?.platform === 'win32' && (
          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1220]">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7">
              <div>
                <h2 className="text-sm font-semibold text-white">Krypton updates</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Installed version {updateInfo?.currentVersion || deviceInfo.appVersion || '—'}
                  {updateInfo?.updateAvailable && updateInfo.latestVersion
                    ? ` · Version ${updateInfo.latestVersion} is ready`
                    : ''}
                </p>
                {updateMessage && <p role="status" className="mt-2 text-xs text-emerald-300">{updateMessage}</p>}
                {updateError && <p role="alert" className="mt-2 text-xs text-rose-300">{updateError}</p>}
                {updateInfo?.updateAvailable && updateInfo.signatureStatus === 'unsigned' && (
                  <p className="mt-2 text-[11px] text-amber-200">
                    This release is unsigned; Windows may show its standard publisher warning.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void (updateInfo?.updateAvailable ? handleInstallUpdate() : handleCheckForUpdates())}
                disabled={updateChecking || updateInstalling}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-50"
              >
                {updateChecking || updateInstalling
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : updateInfo?.updateAvailable
                    ? <Download className="h-4 w-4" />
                    : <RefreshCw className="h-4 w-4" />}
                {updateChecking
                  ? 'Checking…'
                  : updateInstalling
                    ? 'Downloading update…'
                    : updateInfo?.updateAvailable
                      ? 'Update now'
                      : 'Check for updates'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
