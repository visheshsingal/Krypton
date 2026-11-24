import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  ShieldCheck,
  Globe,
  RefreshCw,
  Terminal,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  LogOut,
  ScanLine,
} from 'lucide-react';

interface StoredState {
  licenseKey?: string;
  token?: string;
  user?: {
    name?: string;
    email?: string;
  };
  policy?: any;
  deviceId?: string;
  deviceName?: string;
  usbMonitoringEnabled?: boolean;
}

interface SecurityEventItem {
  id: string;
  timestamp: string;
  targetName: string;
  actionTaken: 'block' | 'warn' | 'allow';
  riskLevel: string;
  ruleName: string;
  summary: string;
}

interface ProtectionSummary {
  active: boolean;
  platform: string;
  noExtensionRequired: boolean;
  inputMonitorReady: boolean;
  stats: {
    scannedCount: number;
    blockedCount: number;
    allowedCount: number;
  };
  recentEvents: SecurityEventItem[];
}

export default function App() {
  const bridge = (window as any).kryptonDesktop;

  // Activation & Auth
  const [isActivated, setIsActivated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [storedState, setStoredState] = useState<StoredState | null>(null);

  // Form Inputs
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivationKey, setDeactivationKey] = useState('');
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const [deactivationLoading, setDeactivationLoading] = useState(false);

  // Protection & Stats
  const [protectionActive, setProtectionActive] = useState(true);
  const [inputMonitorReady, setInputMonitorReady] = useState(false);
  const [stats, setStats] = useState({ scannedCount: 0, blockedCount: 0, allowedCount: 0 });
  const [recentEvents, setRecentEvents] = useState<SecurityEventItem[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId?: string; osVersion?: string; appVersion?: string; platform?: string }>({});
  const [managedBrowserLoading, setManagedBrowserLoading] = useState<'chrome' | 'edge' | null>(null);
  const [managedBrowserError, setManagedBrowserError] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // Interactive Live Scanner Tester
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSample, setCopiedSample] = useState(false);

  // Initialize
  useEffect(() => {
    async function loadInitial() {
      try {
        if (!bridge) {
          setIsInitializing(false);
          return;
        }

        const [state, devInfo] = await Promise.all([
          bridge.getStoredState().catch(() => null),
          bridge.getDeviceInfo().catch(() => ({})),
        ]);

        if (devInfo) setDeviceInfo(devInfo);

        if (state && state.token) {
          setStoredState(state);
          setIsActivated(true);
          await refreshSummary();
        }
      } catch (err) {
        console.warn('Initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    }

    void loadInitial();
  }, []);

  // Poll summary for real-time stats when activated
  useEffect(() => {
    if (!isActivated || !bridge?.getWindowsProtectionSummary) return;

    const interval = setInterval(() => {
      refreshSummary();
    }, 2500);

    return () => clearInterval(interval);
  }, [isActivated]);

  const refreshSummary = async () => {
    if (!bridge?.getWindowsProtectionSummary) return;
    try {
      const summary: ProtectionSummary = await bridge.getWindowsProtectionSummary();
      if (summary) {
        setProtectionActive(summary.active);
        setInputMonitorReady(summary.inputMonitorReady === true);
        setStats({
          scannedCount: Number.isFinite(summary.stats?.scannedCount) ? summary.stats.scannedCount : 0,
          blockedCount: Number.isFinite(summary.stats?.blockedCount) ? summary.stats.blockedCount : 0,
          allowedCount: Number.isFinite(summary.stats?.allowedCount) ? summary.stats.allowedCount : 0,
        });
        if (summary.recentEvents) {
          setRecentEvents(summary.recentEvents);
        }
      }
    } catch (err) {
      console.warn('Could not refresh summary:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (!bridge?.activate) {
        throw new Error('Desktop bridge not available.');
      }

      const res = await bridge.activate({
        licenseKey: licenseKeyInput,
        email: emailInput,
        password: passwordInput,
      });

      if (!res.success) {
        setAuthError(res.error || 'Activation failed. Please check company credentials.');
        return;
      }

      const state = await bridge.getStoredState();
      setStoredState(state);
      setIsActivated(true);
      await refreshSummary();
    } catch (err: any) {
      setAuthError(err.message || 'Connection error.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setDeactivationKey('');
    setDeactivationError(null);
    setShowDeactivateDialog(true);
  };

  const confirmDeactivation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bridge?.logout || !deactivationKey.trim()) {
      setDeactivationError('Enter your license key to deactivate this device.');
      return;
    }

    setDeactivationLoading(true);
    setDeactivationError(null);
    try {
      const result = await bridge.logout(deactivationKey);
      if (!result?.success) {
        setDeactivationError(result?.error || 'Could not verify the license key. This device was not deactivated.');
        return;
      }
      setShowDeactivateDialog(false);
      setIsActivated(false);
      setStoredState(null);
      setPasswordInput('');
    } catch (error) {
      setDeactivationError(error instanceof Error ? error.message : 'Could not deactivate this device.');
    } finally {
      setDeactivationLoading(false);
    }
  };

  const openProtectedChatGPT = async (browser: 'chrome' | 'edge') => {
    if (!bridge?.openProtectedBrowser) {
      setManagedBrowserError('Protected browser launch is unavailable in this app build.');
      return;
    }

    setManagedBrowserLoading(browser);
    setManagedBrowserError(null);
    try {
      const result = await bridge.openProtectedBrowser(browser, 'chatgpt');
      if (!result?.success) {
        setManagedBrowserError(result?.error || 'Could not open the protected browser.');
      }
    } catch (error) {
      setManagedBrowserError(error instanceof Error ? error.message : 'Could not open the protected browser.');
    } finally {
      setManagedBrowserLoading(null);
    }
  };

  const handleTestScan = async () => {
    if (!testInput.trim()) return;
    setIsTesting(true);
    try {
      if (bridge?.inspectTypedPrompt) {
        const res = await bridge.inspectTypedPrompt(testInput, 'Live DLP Tester');
        setTestResult(res?.result || res);
        await refreshSummary();
      } else if (bridge?.scanPrompt) {
        const res = await bridge.scanPrompt(testInput);
        setTestResult(res);
        await refreshSummary();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  const copySampleThreat = (sample: string) => {
    setTestInput(sample);
    setCopiedSample(true);
    setTimeout(() => setCopiedSample(false), 2000);
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-slate-600">
        <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
        <span className="ml-3 text-sm font-medium">Starting Krypton…</span>
      </div>
    );
  }

  if (!isActivated) {
    return (
      <div className="min-h-screen bg-white px-5 py-8 text-slate-950 sm:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
          <header className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Krypton</span>
          </header>

          <main className="grid flex-1 items-center gap-12 py-12 md:grid-cols-[1fr_420px]">
            <section className="max-w-lg">
              <p className="text-sm font-medium text-blue-700">Device protection</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Sign in to Krypton</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
                Use the license key and account credentials provided by your company to connect this device.
              </p>
              <div className="mt-8 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-500">
                Supported prompt inspection runs in the isolated Chrome or Edge profile opened by Krypton. Coverage does not extend to every browser or app.
              </div>
            </section>

            <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.22)] sm:p-8">
              <h2 className="text-lg font-semibold">Activate this device</h2>
              <p className="mt-1 text-sm text-slate-500">Enter your company credentials.</p>

              {authError && (
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="license-key" className="text-sm font-medium text-slate-800">License key</label>
                  <input
                    id="license-key"
                    type="text"
                    required
                    placeholder="KRP-XXXX-XXXX-XXXX"
                    value={licenseKeyInput}
                    onChange={(event) => setLicenseKeyInput(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="employee-email" className="text-sm font-medium text-slate-800">Email</label>
                  <input
                    id="employee-email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="employee-password" className="text-sm font-medium text-slate-800">Password</label>
                  <div className="relative mt-1.5">
                    <input
                      id="employee-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-900"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {authLoading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Connecting…</> : 'Continue'}
                </button>
              </form>
              <p className="mt-5 text-xs leading-5 text-slate-500">
                Activation checks this device and loads its company policy.
              </p>
            </section>
          </main>
          <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">Krypton · Device security</footer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Krypton</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 sm:inline">{storedState?.user?.email || 'Protected employee'}</span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Deactivate
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-700">Device overview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Protection status</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Company policy is applied on this device. Use Krypton’s managed browser profile for supported prompt inspection.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium ${
            protectionActive && inputMonitorReady
              ? 'border-blue-200 bg-blue-50 text-blue-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <span className={`h-2 w-2 rounded-full ${protectionActive && inputMonitorReady ? 'bg-blue-600' : 'bg-amber-500'}`} />
            {protectionActive && inputMonitorReady ? 'Protection ready' : 'Protection needs attention'}
          </div>
        </div>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Protected browsing</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Open an isolated browser profile connected to Krypton’s local policy scanner.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void openProtectedChatGPT('chrome')}
                disabled={deviceInfo.platform !== 'win32' || managedBrowserLoading !== null}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {managedBrowserLoading === 'chrome' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Open protected Chrome
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void openProtectedChatGPT('edge')}
                disabled={deviceInfo.platform !== 'win32' || managedBrowserLoading !== null}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {managedBrowserLoading === 'edge' ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                Open protected Edge
              </button>
            </div>
            {deviceInfo.platform !== 'win32' && (
              <p className="mt-4 text-sm text-amber-700">Managed Chrome/Edge prompt inspection is available on Windows only.</p>
            )}
            {managedBrowserError && <p className="mt-4 text-sm text-red-700" role="alert">{managedBrowserError}</p>}
            {protectionActive && !inputMonitorReady && (
              <p className="mt-4 text-sm text-amber-700">The local keyboard/accessibility guard is not ready. Do not treat this device as fully protected.</p>
            )}
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
              AI sites covered by user-level browser blocking can be bypassed in unsupported browsers, through VPNs, or by changing proxy settings.
            </p>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-label="Local scan activity">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Scan activity</h2>
                <p className="mt-1 text-sm text-slate-500">Local counts · since app launch</p>
              </div>
              <ScanLine className="h-5 w-5 text-blue-600" />
            </div>
            <div className="mt-6">
              <p className="text-sm text-slate-500">Prompts inspected</p>
              <p className="mt-1 font-mono text-5xl font-semibold tracking-tight">{stats.scannedCount.toLocaleString('en-US')}</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Blocked</p>
                <p className="mt-1 text-2xl font-semibold">{stats.blockedCount.toLocaleString('en-US')}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-sm text-blue-700">Allowed</p>
                <p className="mt-1 text-2xl font-semibold text-blue-900">{stats.allowedCount.toLocaleString('en-US')}</p>
              </div>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-500">Latest event</p>
              {recentEvents[0] ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">{recentEvents[0].ruleName}</p>
                  <span className={`shrink-0 text-xs font-semibold ${
                    recentEvents[0].actionTaken === 'block' ? 'text-red-700' :
                    recentEvents[0].actionTaken === 'warn' ? 'text-amber-700' : 'text-blue-700'
                  }`}>{recentEvents[0].actionTaken.toUpperCase()}</span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No scan activity yet.</p>
              )}
            </div>
          </section>
        </section>

        <details
          open={diagnosticsOpen}
          onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
          className="mt-5 rounded-2xl border border-slate-200 bg-white"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium text-slate-800">
            <span className="flex items-center gap-2"><Terminal className="h-4 w-4 text-blue-600" /> Diagnostics and activity</span>
            <ArrowDown className="h-4 w-4 text-slate-500 transition-transform open:rotate-180" />
          </summary>
          <div className="grid gap-6 border-t border-slate-200 p-5 lg:grid-cols-2">
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Test local scanner</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Use synthetic sample text only. This tests local rules, not sending data to an AI site.</p>
              </div>
              <button
                type="button"
                onClick={() => copySampleThreat('Test only: OPENAI_API_KEY=sk-proj-abc1234567890def1234567890ghij')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {copiedSample ? 'Sample loaded' : 'Load synthetic secret'}
              </button>
              <textarea
                rows={3}
                value={testInput}
                onChange={(event) => setTestInput(event.target.value)}
                placeholder="Enter synthetic text to test"
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-mono outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestScan}
                  disabled={isTesting || !testInput.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  {isTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                  Run local scan
                </button>
                {testResult && <span className={`text-xs font-semibold ${testResult.action === 'block' ? 'text-red-700' : 'text-blue-700'}`}>{testResult.action?.toUpperCase()} · {testResult.highestRisk}</span>}
              </div>
              {testResult?.hasRisk && testResult.matches?.length > 0 && (
                <p className="text-xs leading-5 text-slate-600">Matched: {testResult.matches.map((match: any) => match.ruleName).join(', ')}</p>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold">Recent endpoint events</h2>
              <p className="mt-1 text-xs text-slate-500">Events reported by this device.</p>
              {recentEvents.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No events recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {recentEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{event.ruleName}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{event.targetName} · {new Date(event.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold ${event.actionTaken === 'block' ? 'text-red-700' : event.actionTaken === 'warn' ? 'text-amber-700' : 'text-blue-700'}`}>{event.actionTaken.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </details>
      </main>

      {showDeactivateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={confirmDeactivation}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivation-title"
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><Lock className="h-5 w-5" /></div>
              <div>
                <h2 id="deactivation-title" className="text-base font-semibold">Deactivate this device?</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">Enter the device license key to stop protection and sign out.</p>
              </div>
            </div>
            <label htmlFor="deactivation-license-key" className="mb-1.5 block text-sm font-medium text-slate-800">License key</label>
            <input
              id="deactivation-license-key"
              type="password"
              autoComplete="off"
              autoFocus
              value={deactivationKey}
              onChange={(event) => {
                setDeactivationKey(event.target.value);
                setDeactivationError(null);
              }}
              placeholder="Enter license key"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            {deactivationError && <p className="mt-2 text-sm text-red-700" role="alert">{deactivationError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeactivateDialog(false)}
                disabled={deactivationLoading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deactivationLoading || !deactivationKey.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deactivationLoading ? 'Verifying…' : 'Verify & deactivate'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
