import React, { useEffect, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, KeyRound, LogOut, Shield, ShieldCheck } from 'lucide-react';

type DesktopState = {
  license?: string;
  token?: string;
  user?: {
    name?: string;
    email?: string;
  };
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

type KryptonDesktopBridge = {
  getDeviceInfo: () => Promise<{ deviceId?: string; deviceName?: string; osVersion?: string }>;
  getStoredState: () => Promise<DesktopState | null>;
  createExtensionPairing: (browser: 'chrome' | 'edge') => Promise<{
    success: boolean;
    pairingCode?: string;
    expiresAt?: string;
    error?: string;
  }>;
  getExtensionStatus: () => Promise<BrowserExtensionStatus>;
  activate: (data: { licenseKey: string; email: string; password: string }) => Promise<ActivationResult>;
  logout: () => Promise<{ success: boolean; warning?: string }>;
  openExternal: (url: string) => Promise<void>;
};

const desktopBridge = (window as Window & { kryptonDesktop?: KryptonDesktopBridge }).kryptonDesktop;

export default function App() {
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId?: string; deviceName?: string; osVersion?: string } | null>(null);
  const [storedState, setStoredState] = useState<DesktopState | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<BrowserExtensionStatus | null>(null);
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

  useEffect(() => {
    if (!desktopBridge) {
      setIsInitializing(false);
      return;
    }

    Promise.all([
      desktopBridge.getDeviceInfo(),
      desktopBridge.getStoredState(),
    ])
      .then(([device, state]) => {
        setDeviceInfo(device);
        setStoredState(state);
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
        if (active) {
          setExtensionStatus(status);
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">Krypton desktop runtime unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">Activation is available in the installed desktop application.</p>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Checking activation…
      </div>
    );
  }

  if (!isActivated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-2">
            <Shield className="h-5 w-5 text-sky-300" />
          </div>
          <div>
            <h1 className="font-semibold text-white">Krypton Security</h1>
            <p className="text-xs text-slate-400">Account activated</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-xs">
            <p className="font-medium text-slate-200">{storedState?.user?.name || 'Employee'}</p>
            <p className="text-slate-400">{storedState?.user?.email || 'Activated user'}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <section className="rounded-2xl border border-sky-300/20 bg-slate-900 p-7 shadow-[0_24px_100px_rgba(2,132,199,0.12)]">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-sky-300/20 bg-sky-400/10 p-3">
              <ShieldCheck className="h-6 w-6 text-sky-300" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Browser protection</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Use the shared Krypton extension in Chrome or Edge. It checks supported AI prompts locally.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-700 bg-slate-950/70 p-4">
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

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="extension-browser" className="mb-1 block text-xs font-medium text-slate-300">
                Browser
              </label>
              <select
                id="extension-browser"
                value={selectedBrowser}
                onChange={(event) => setSelectedBrowser(event.target.value as 'chrome' | 'edge')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="chrome">Google Chrome</option>
                <option value="edge">Microsoft Edge</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => void desktopBridge.openExternal('https://krypton-ten-theta.vercel.app/downloads/krypton-browser-extension.zip')}
              className="w-full rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-400/20"
            >
              Download common extension ZIP
            </button>
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-400">
              <li>Extract the downloaded ZIP to a folder.</li>
              <li>Open {selectedBrowser === 'chrome' ? 'chrome://extensions' : 'edge://extensions'} and turn on Developer mode.</li>
              <li>Choose “Load unpacked” and select the extracted folder.</li>
              <li>Return here, generate a one-time code, then enter it in the extension popup.</li>
            </ol>
            <p className="text-[11px] leading-5 text-slate-500">
              This ZIP is for development or managed installation. Chrome Web Store publishing and its approved listing are not configured yet. The code expires after 10 minutes and can be used once.
            </p>

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
              Prompt text and detected secrets are scanned locally and are not uploaded. Only redacted incident metadata is reported. Protection covers supported AI sites in Chrome/Edge, not other pages or browsers.
            </p>
            <p className="text-[11px] text-slate-500">
              Device: {deviceInfo?.deviceName || 'This computer'} · {deviceInfo?.osVersion || 'Desktop OS'}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
