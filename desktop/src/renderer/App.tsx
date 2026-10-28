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

type WebsiteProtectionStatus = {
  available: boolean;
  status: string;
  platform: string;
  scope?: string;
  browsers?: Array<'chrome' | 'edge'>;
};

type KryptonDesktopBridge = {
  getDeviceInfo: () => Promise<{ deviceId?: string; deviceName?: string; osVersion?: string }>;
  getStoredState: () => Promise<DesktopState | null>;
  getWebsiteProtectionAvailability: () => Promise<WebsiteProtectionStatus>;
  openProtectedBrowser: (browser: 'chrome' | 'edge', site: string) => Promise<{ success: boolean; error?: string }>;
  activate: (data: { licenseKey: string; email: string; password: string }) => Promise<ActivationResult>;
  logout: () => Promise<void>;
};

const desktopBridge = (window as Window & { kryptonDesktop?: KryptonDesktopBridge }).kryptonDesktop;

export default function App() {
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId?: string; deviceName?: string; osVersion?: string } | null>(null);
  const [storedState, setStoredState] = useState<DesktopState | null>(null);
  const [websiteStatus, setWebsiteStatus] = useState<WebsiteProtectionStatus | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [openingSite, setOpeningSite] = useState<string | null>(null);
  const [selectedBrowser, setSelectedBrowser] = useState<'chrome' | 'edge'>('chrome');

  useEffect(() => {
    if (!desktopBridge) {
      setIsInitializing(false);
      return;
    }

    Promise.all([
      desktopBridge.getDeviceInfo(),
      desktopBridge.getStoredState(),
      desktopBridge.getWebsiteProtectionAvailability(),
    ])
      .then(([device, state, protectionStatus]) => {
        setDeviceInfo(device);
        setStoredState(state);
        setWebsiteStatus(protectionStatus);
        if (protectionStatus.browsers?.length) {
          setSelectedBrowser(protectionStatus.browsers[0]);
        }
        setIsActivated(Boolean(state?.license && state?.token));
      })
      .catch((error: unknown) => {
        console.error('Failed to load activation state:', error);
        setActivationError('Could not load the saved activation. Restart the app and try again.');
      })
      .finally(() => setIsInitializing(false));
  }, []);

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
      const protectionStatus = await desktopBridge.getWebsiteProtectionAvailability();
      setWebsiteStatus(protectionStatus);
      if (protectionStatus.browsers?.length) {
        setSelectedBrowser(protectionStatus.browsers[0]);
      }
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : 'Could not connect to the activation service.');
    } finally {
      setActivationLoading(false);
    }
  }

  async function handleLogout() {
    if (!desktopBridge) return;
    try {
      await desktopBridge.logout();
      setStoredState(null);
      setIsActivated(false);
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : 'Could not log out.');
    }
  }

  async function handleOpenProtectedBrowser(site: string) {
    if (!desktopBridge) return;
    setOpeningSite(site);
    setBrowserError(null);
    try {
      const result = await desktopBridge.openProtectedBrowser(selectedBrowser, site);
      if (!result.success) setBrowserError(result.error || 'Could not open the protected browser.');
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : 'Could not open the protected browser.');
    } finally {
      setOpeningSite(null);
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
              <h2 className="text-xl font-semibold text-white">Website protection</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Protection status for this device.
              </p>
            </div>
          </div>

          <div className={`mt-6 rounded-lg border p-4 ${
            websiteStatus?.available
              ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
              : 'border-amber-500/25 bg-amber-500/[0.06]'
          }`}>
            <p className={`text-sm font-medium ${
              websiteStatus?.available ? 'text-emerald-200' : 'text-amber-200'
            }`}>
              {websiteStatus?.available ? 'Protected browser ready' : 'Protected browser unavailable'}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Krypton connects to a separate Chrome/Edge profile and checks AI-site submissions locally. Sign into Gmail in that browser profile; its login stays there. Your normal browser profile and other apps are not monitored. No extension is installed.
            </p>
            <label htmlFor="protected-browser" className="mt-4 block text-xs font-medium text-slate-300">
              Choose browser
            </label>
            <select
              id="protected-browser"
              value={selectedBrowser}
              onChange={(event) => setSelectedBrowser(event.target.value as 'chrome' | 'edge')}
              disabled={!websiteStatus?.available || openingSite !== null}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-40"
            >
              {(websiteStatus?.browsers || []).map((browser) => (
                <option key={browser} value={browser}>
                  {browser === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'}
                </option>
              ))}
            </select>
            {websiteStatus?.status === 'browser_not_installed' && (
              <p className="mt-2 text-xs text-amber-200">Install Chrome or Edge to use protected browsing.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ['chatgpt', 'Open ChatGPT'],
                ['claude', 'Open Claude'],
                ['gemini', 'Open Gemini'],
                ['copilot', 'Open Copilot'],
                ['perplexity', 'Open Perplexity'],
              ].map(([site, label]) => (
                <button
                  key={site}
                  type="button"
                  disabled={!websiteStatus?.available || openingSite !== null}
                  onClick={() => handleOpenProtectedBrowser(site)}
                  className="rounded-lg border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-100 transition-colors hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {openingSite === site ? 'Opening…' : label}
                </button>
              ))}
            </div>
            {browserError && (
              <p role="alert" className="mt-3 text-xs text-red-300">{browserError}</p>
            )}
            <p className="mt-3 text-xs leading-5 text-amber-200">
              Admin-only locking of the signed-in Gmail account is not enabled yet; browser account changes are currently controlled by Chrome/Edge.
            </p>
            {websiteStatus?.status === 'license_validation_required' && (
              <p className="mt-3 text-xs text-amber-200">
                Reconnect to Krypton to validate your license before opening protected browsing.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Device: {deviceInfo?.deviceName || 'This computer'} · {websiteStatus?.platform || deviceInfo?.platform || 'Desktop'}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
