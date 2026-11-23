import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  ShieldCheck,
  Globe,
  RefreshCw,
  Terminal,
  Fingerprint,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  LogOut,
  ScanLine,
  Sparkles,
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

  const handleToggleProtection = async () => {
    if (!bridge?.toggleWindowsProtection) return;
    const result = await bridge.toggleWindowsProtection(!protectionActive);
    if (result?.success) {
      setProtectionActive(result.active);
      await refreshSummary();
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
      <div className="flex h-screen items-center justify-center bg-[#070b14] text-slate-300">
        <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
        <span className="ml-3 text-sm font-medium">Starting Krypton Enterprise Agent…</span>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: ENTERPRISE LICENSE & CREDENTIAL ACTIVATION
  // =========================================================================
  if (!isActivated) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#080b10] font-sans text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(14,165,233,0.12),transparent_35%),radial-gradient(ellipse_at_82%_78%,rgba(20,184,166,0.08),transparent_35%)]" />
        <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-12">
          <section className="max-w-2xl">
            <div className="mb-12 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-[0.24em] text-white">KRYPTON / SENTINEL</p>
                <p className="mt-1 text-[10px] tracking-[0.18em] text-slate-500">ENDPOINT PROMPT DEFENSE</p>
              </div>
            </div>

            <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-cyan-300 uppercase">
              <span className="h-px w-8 bg-cyan-400" /> A control point before AI
            </p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-white sm:text-6xl xl:text-7xl">
              Keep the prompt.
              <span className="mt-2 block bg-gradient-to-r from-cyan-200 via-sky-400 to-teal-300 bg-clip-text text-transparent">
                Keep control.
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-sm leading-7 text-slate-400 sm:text-base">
              Inspect sensitive text locally, apply company policy, and make the decision before a supported prompt leaves the device.
            </p>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 border-y border-white/10 py-5">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-500">01 / INSPECT</p>
                <p className="mt-2 text-xs font-medium text-slate-200">Prompt text</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-500">02 / EVALUATE</p>
                <p className="mt-2 text-xs font-medium text-slate-200">Local policy</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-500">03 / DECIDE</p>
                <p className="mt-2 text-xs font-medium text-slate-200">Allow or block</p>
              </div>
            </div>
            <p className="mt-5 max-w-xl text-[11px] leading-5 text-slate-500">
              Coverage depends on platform and app accessibility. Extension-free request inspection is available only in Krypton-managed Chrome/Edge profiles on Windows; it does not cover every browser window or application.
            </p>
          </section>

          <section className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#0d121a]/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <div className="mb-7 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-cyan-300">DEVICE ENROLLMENT</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Activate this endpoint</h2>
                <p className="mt-1 text-xs text-slate-500">Use the credentials issued by your company.</p>
              </div>
              <Fingerprint className="h-5 w-5 text-slate-500" />
            </div>

            {authError && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="license-key" className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                  Company license key
                </label>
                <div className="relative mt-2">
                  <KeyRound className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                  <input
                    id="license-key"
                    type="text"
                    required
                    placeholder="KRP-XXXX-XXXX-XXXX"
                    value={licenseKeyInput}
                    onChange={(event) => setLicenseKeyInput(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#080b10] py-3 pr-4 pl-10 text-sm font-mono text-white placeholder-slate-700 outline-none transition focus:border-cyan-400/60"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="employee-email" className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                  Employee email
                </label>
                <div className="relative mt-2">
                  <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                  <input
                    id="employee-email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#080b10] py-3 pr-4 pl-10 text-sm text-white placeholder-slate-700 outline-none transition focus:border-cyan-400/60"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="employee-password" className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                  Account password
                </label>
                <div className="relative mt-2">
                  <Lock className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                  <input
                    id="employee-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#080b10] py-3 pr-11 pl-10 text-sm text-white placeholder-slate-700 outline-none transition focus:border-cyan-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-3 right-3 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60"
              >
                {authLoading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Activating endpoint…</> : <>Activate endpoint <ArrowUpRight className="h-4 w-4" /></>}
              </button>
            </form>
            <p className="mt-5 text-center text-[10px] leading-5 text-slate-600">
              Activation validates this device and loads its company security policy.
            </p>
          </section>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: KRYPTON SENTINEL CONTROL SURFACE
  // =========================================================================
  return (
    <div className="min-h-screen overflow-hidden bg-[#080b10] font-sans text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_16%_38%,rgba(8,145,178,0.11),transparent_35%),radial-gradient(ellipse_at_86%_4%,rgba(13,148,136,0.09),transparent_32%)]" />
      <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-white/[0.07] bg-[#080b10]/80 px-5 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-white">KRYPTON / SENTINEL</p>
            <p className="mt-0.5 text-[9px] tracking-[0.16em] text-slate-500">ENDPOINT CONTROL SURFACE</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden text-right sm:block">
            <p className="text-[11px] font-medium text-slate-200">{storedState?.user?.email || 'Protected employee'}</p>
            <p className="mt-0.5 text-[9px] tracking-wider text-teal-300">LICENSE VERIFIED</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] font-semibold tracking-wider text-slate-400 transition hover:border-rose-400/40 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            DEACTIVATE
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#0c121a] shadow-[0_30px_120px_-45px_rgba(6,182,212,0.28)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom_right,black,transparent_82%)]" />
          <div className="pointer-events-none absolute -right-28 -top-40 h-[480px] w-[480px] rounded-full border border-cyan-200/[0.07]" />
          <div className="pointer-events-none absolute -right-12 -top-24 h-[340px] w-[340px] rounded-full border border-cyan-200/[0.08]" />

          <div className="relative grid min-h-[610px] gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-14">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${protectionActive && inputMonitorReady ? 'bg-teal-300 shadow-[0_0_12px_rgba(94,234,212,0.8)]' : 'bg-amber-300'}`} />
                <span className="text-[9px] font-bold tracking-[0.18em] text-slate-300">
                  {protectionActive && inputMonitorReady ? 'GUARD ONLINE' : protectionActive ? 'GUARD NOT READY' : 'GUARD PAUSED'}
                </span>
                <span className="mx-1 h-3 w-px bg-white/10" />
                <span className="text-[9px] tracking-wider text-slate-500">LOCAL POLICY ENGINE</span>
              </div>

              <p className="mt-8 flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-cyan-300">
                <span className="h-px w-8 bg-cyan-300/70" /> THE PROMPT PERIMETER
              </p>
              <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-[0.96] tracking-[-0.065em] text-white sm:text-6xl xl:text-7xl">
                Your data.
                <span className="mt-2 block text-slate-500">Your boundary.</span>
              </h1>
              <p className="mt-7 max-w-lg text-sm leading-7 text-slate-400 sm:text-base">
                Sensitive prompt content is evaluated on this device against company rules. Risky actions can be held for a decision before submission.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void openProtectedChatGPT('chrome')}
                  disabled={deviceInfo.platform !== 'win32' || managedBrowserLoading !== null}
                  className="group inline-flex items-center gap-3 rounded-lg bg-cyan-300 px-5 py-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {managedBrowserLoading === 'chrome' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  OPEN PROTECTED CHROME
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void openProtectedChatGPT('edge')}
                  disabled={deviceInfo.platform !== 'win32' || managedBrowserLoading !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-4 py-3 text-xs font-semibold text-slate-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {managedBrowserLoading === 'edge' ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  OPEN EDGE
                </button>
                <button
                  type="button"
                  onClick={handleToggleProtection}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-xs font-semibold text-slate-400 transition hover:border-white/25 hover:text-white"
                >
                  {protectionActive ? 'PAUSE DEVICE GUARD' : 'RESUME DEVICE GUARD'}
                </button>
              </div>
              {deviceInfo.platform !== 'win32' && (
                <p className="mt-4 text-xs text-amber-300">Protected Chrome/Edge request inspection is available on Windows only.</p>
              )}
              {managedBrowserError && (
                <p className="mt-4 text-xs text-rose-300" role="alert">{managedBrowserError}</p>
              )}
              {protectionActive && !inputMonitorReady && (
                <p className="mt-4 text-xs text-amber-300">The native keyboard/accessibility guard is not ready. Do not treat this device as protected yet.</p>
              )}
            </div>

            <div className="relative mx-auto w-full max-w-[440px]">
              <div className="absolute -inset-8 rounded-full bg-cyan-400/[0.08] blur-3xl" />
              <div className="relative rounded-xl border border-white/10 bg-[#080d13]/90 p-5 shadow-2xl backdrop-blur sm:p-6">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.2em] text-slate-500">INSPECTION PATH</p>
                    <p className="mt-1 text-xs font-semibold text-slate-200">Local decision gate</p>
                  </div>
                  <ScanLine className="h-5 w-5 text-cyan-300" />
                </div>
                <div className="relative mt-5 space-y-3">
                  <div className="absolute bottom-8 left-[19px] top-8 w-px bg-gradient-to-b from-cyan-300/50 via-cyan-300/20 to-teal-300/50" />
                  <div className="relative flex items-center gap-4 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3.5">
                    <span className="z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-200"><Fingerprint className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[9px] font-bold tracking-[0.16em] text-slate-500">01 / INPUT</p>
                      <p className="mt-1 text-xs font-semibold text-white">Prompt entry detected</p>
                    </div>
                    <span className="ml-auto text-[9px] text-slate-600">DEVICE</span>
                  </div>
                  <div className="relative flex items-center gap-4 rounded-lg border border-cyan-200/15 bg-cyan-200/[0.045] p-3.5">
                    <span className="z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-200"><ScanLine className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[9px] font-bold tracking-[0.16em] text-cyan-200/60">02 / ANALYZE</p>
                      <p className="mt-1 text-xs font-semibold text-white">Company rules evaluated</p>
                    </div>
                    <span className="ml-auto text-[9px] text-cyan-200/70">LOCAL</span>
                  </div>
                  <div className="relative flex items-center gap-4 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3.5">
                    <span className="z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-teal-200/20 bg-teal-200/10 text-teal-200"><ShieldCheck className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[9px] font-bold tracking-[0.16em] text-slate-500">03 / CONTROL</p>
                      <p className="mt-1 text-xs font-semibold text-white">Allow, warn, or block</p>
                    </div>
                    <span className="ml-auto text-[9px] text-slate-600">POLICY</span>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4">
                  <span className="text-[9px] tracking-[0.14em] text-slate-500">PRE-SUBMISSION CONTROL</span>
                  <span className="inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.12em] text-teal-200"><Sparkles className="h-3 w-3" /> RAW TEXT SCANNED LOCALLY</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative grid gap-0 border-t border-white/[0.08] bg-black/20 sm:grid-cols-3">
            <div className="flex gap-3 border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r sm:p-6">
              <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-white">LOCAL SCAN</p>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">Text is inspected on-device by the configured rules engine.</p>
              </div>
            </div>
            <div className="flex gap-3 border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r sm:p-6">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-white">MANAGED BROWSER</p>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">Request-level inspection runs in the isolated Windows Chrome/Edge profile, without an extension.</p>
              </div>
            </div>
            <div className="flex gap-3 p-5 sm:p-6">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] text-white">CLEAR SCOPE</p>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">Standard browser windows and inaccessible apps are not guaranteed coverage.</p>
              </div>
            </div>
          </div>
        </section>

        <details
          open={diagnosticsOpen}
          onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
          className="mt-5 rounded-xl border border-white/[0.08] bg-[#0c121a]/80"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-2"><Terminal className="h-4 w-4 text-slate-500" /> Diagnostics & activity</span>
            <ArrowDown className="h-3.5 w-3.5 text-slate-500 transition-transform open:rotate-180" />
          </summary>
          <div className="grid gap-5 border-t border-white/[0.08] p-5 lg:grid-cols-2">
            <section className="space-y-3">
              <div>
                <h2 className="text-xs font-bold text-white">Safe prompt test</h2>
                <p className="mt-1 text-[10px] text-slate-500">Use synthetic sample text only. This tests the local rule engine, not delivery to an AI site.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copySampleThreat('Test only: OPENAI_API_KEY=sk-proj-abc1234567890def1234567890ghij')}
                  className="rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-300 hover:border-white/25"
                >
                  {copiedSample ? 'Sample loaded' : 'Load synthetic secret'}
                </button>
              </div>
              <textarea
                rows={3}
                value={testInput}
                onChange={(event) => setTestInput(event.target.value)}
                placeholder="Enter synthetic text to test the local scanner"
                className="w-full rounded-lg border border-white/10 bg-[#080b10] p-3 text-xs font-mono text-white placeholder-slate-700 outline-none focus:border-cyan-300/50"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestScan}
                  disabled={isTesting || !testInput.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-white/15 disabled:opacity-40"
                >
                  {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                  RUN LOCAL SCAN
                </button>
                {testResult && <span className={`text-[10px] font-bold ${testResult.action === 'block' ? 'text-rose-300' : 'text-teal-300'}`}>{testResult.action?.toUpperCase()} · {testResult.highestRisk}</span>}
              </div>
              {testResult?.hasRisk && testResult.matches?.length > 0 && (
                <p className="text-[10px] leading-5 text-slate-400">
                  Matched: {testResult.matches.map((match: any) => match.ruleName).join(', ')}
                </p>
              )}
            </section>

            <section>
              <h2 className="text-xs font-bold text-white">Recent endpoint events</h2>
              <p className="mt-1 text-[10px] text-slate-500">Events reported by this device.</p>
              {recentEvents.length === 0 ? (
                <p className="mt-5 rounded-lg border border-dashed border-white/10 p-4 text-center text-[10px] text-slate-500">No events recorded on this device yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {recentEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-semibold text-slate-200">{event.ruleName}</p>
                        <p className="mt-1 truncate text-[9px] text-slate-500">{event.targetName} · {new Date(event.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <span className={`shrink-0 text-[9px] font-bold tracking-wider ${event.actionTaken === 'block' ? 'text-rose-300' : event.actionTaken === 'warn' ? 'text-amber-300' : 'text-teal-300'}`}>{event.actionTaken.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </details>
      </main>

      {showDeactivateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={confirmDeactivation}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0b1220] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivation-title"
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-300">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 id="deactivation-title" className="text-base font-bold text-white">Confirm device deactivation</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Enter the license key assigned to this device to continue. Protection will stop after verification.
                </p>
              </div>
            </div>

            <label htmlFor="deactivation-license-key" className="mb-1.5 block text-xs font-medium text-slate-300">
              License key
            </label>
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-sky-500"
            />
            {deactivationError && (
              <p className="mt-2 text-xs text-rose-300" role="alert">{deactivationError}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeactivateDialog(false)}
                disabled={deactivationLoading}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deactivationLoading || !deactivationKey.trim()}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deactivationLoading ? 'Verifying…' : 'Verify & Deactivate'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
