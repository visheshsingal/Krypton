import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Globe,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Activity,
  Keyboard,
  ClipboardCheck,
  Flame,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  LogOut,
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
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId?: string; osVersion?: string; appVersion?: string }>({});

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
        setStats(summary.stats || { scannedCount: 0, blockedCount: 0, allowedCount: 0 });
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 font-sans text-slate-100 select-none">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[450px] w-[600px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-40 right-10 h-[350px] w-[450px] rounded-full bg-indigo-500/10 blur-[120px]" />

        <div className="relative w-full max-w-md rounded-2xl border border-slate-800/90 bg-[#0c1322]/95 p-8 shadow-2xl shadow-black/80 backdrop-blur-xl">
          {/* Logo & Headline */}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-teal-400 shadow-lg shadow-sky-500/25">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Krypton Enterprise</h1>
            <p className="mt-1 text-xs text-slate-400">
              Corporate AI Data Loss Prevention · Endpoint Activation
            </p>
          </div>

          {authError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Company License Key
              </label>
              <div className="relative mt-1.5">
                <KeyRound className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="KRP-XXXX-XXXX-XXXX"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2.5 pr-4 pl-10 text-sm font-mono text-white placeholder-slate-600 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Employee Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="employee@company.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2.5 pr-4 pl-10 text-sm text-white placeholder-slate-600 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2.5 pr-10 pl-10 text-sm text-white placeholder-slate-600 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-2.5 right-3 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            >
              {authLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Verifying License & Activating…
                </>
              ) : (
                'Activate & Enforce DLP Protection'
              )}
            </button>
          </form>

          {/* Policy Information */}
          <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-center">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ⚡ <strong className="text-slate-200">Windows device guard:</strong> On supported Windows devices, Krypton locally checks text pasted or submitted in enabled AI platforms using keyboard, mouse, and accessibility hooks. Browser titles and accessibility support affect coverage; this is not guaranteed for every app or screen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: PROFESSIONAL ENTERPRISE ENDPOINT DASHBOARD (Tamper-Proof)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#070b14] font-sans text-slate-100 select-none">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-[#090e1c]/90 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-teal-400 shadow-md shadow-sky-500/20">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">KRYPTON ENDPOINT</h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Device: {deviceInfo.deviceId || storedState?.deviceId || 'WIN-ENDPOINT'} · Agent v{deviceInfo.appVersion || '1.0.1'}
            </p>
          </div>
        </div>

        {/* User Badge & Logout */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-medium text-white">{storedState?.user?.email || 'Protected Employee'}</p>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Company License Active
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Log out of this device"
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Deactivate</span>
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="mx-auto max-w-5xl p-6 sm:p-8 space-y-6">
        {/* Shield Status Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-r from-[#0c162d] via-[#091122] to-[#080d1a] p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-lg shadow-emerald-500/20">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Real-Time AI DLP Protection {protectionActive && inputMonitorReady ? 'Active' : 'Not Ready'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {protectionActive && inputMonitorReady
                    ? 'Windows accessibility and keyboard guard is ready for enabled AI platforms; prompt content is scanned locally.'
                    : protectionActive
                      ? 'The native Windows input guard is unavailable or still starting; do not treat this device as protected.'
                      : 'Protection is paused by the local device operator.'}
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleProtection}
              className={`shrink-0 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                protectionActive
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {protectionActive ? 'Pause Protection' : 'Activate Protection'}
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Protection Status</span>
              <Activity className={`h-4 w-4 ${protectionActive && inputMonitorReady ? 'text-emerald-400' : 'text-amber-400'}`} />
            </div>
            <p className={`mt-2 text-2xl font-bold ${protectionActive && inputMonitorReady ? 'text-emerald-400' : 'text-amber-400'}`}>
              {protectionActive && inputMonitorReady ? 'Guarding' : 'Not Ready'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {inputMonitorReady ? 'Windows OS input guard active' : 'Native input guard unavailable'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Threats Blocked</span>
              <XCircle className="h-4 w-4 text-rose-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-400">{stats.blockedCount}</p>
            <p className="mt-1 text-[11px] text-slate-500">Sensitive prompt leaks intercepted</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Security Engine</span>
              {inputMonitorReady
                ? <CheckCircle2 className="h-4 w-4 text-sky-400" />
                : <AlertTriangle className="h-4 w-4 text-amber-400" />}
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{inputMonitorReady ? 'Ready' : 'Unavailable'}</p>
            <p className="mt-1 text-[11px] text-slate-500">Windows keyboard, mouse & accessibility guard</p>
          </div>
        </div>

        {/* Live Interactive Scanner Tester */}
        <section className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-400" />
                Live Prompt DLP Tester
              </h3>
              <p className="text-xs text-slate-400">
                Test how Krypton scans and blocks sensitive secrets or allows safe prompts against company policy.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  copySampleThreat('Here is my OpenAI key sk-proj-998877665544332211aabbccddeeffgghhiijj')
                }
                className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                {copiedSample ? 'Loaded Sample!' : 'Try API Key Threat'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <textarea
              rows={3}
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Type or paste any prompt here to test instant Krypton DLP scanner response..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs font-mono text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestScan}
                disabled={isTesting || !testInput.trim()}
                className="flex items-center gap-2 rounded-xl bg-sky-500/15 border border-sky-400/30 px-4 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40"
              >
                {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Run Live Scan
              </button>

              {testResult && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Action:</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      testResult.action === 'block'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {testResult.action === 'block' ? '🚫 BLOCKED' : '✅ ALLOWED'}
                  </span>
                  <span className="text-slate-400">Risk: {testResult.highestRisk}</span>
                </div>
              )}
            </div>

            {testResult?.hasRisk && testResult.matches?.length > 0 && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 space-y-1">
                <p className="font-semibold text-rose-300">
                  Detected Violations: {testResult.matches.map((m: any) => m.ruleName).join(', ')}
                </p>
                <p className="text-[11px] text-slate-300">
                  Redacted Preview: <span className="font-mono text-white">{testResult.redactedPrompt}</span>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Recent Real-Time Activity Log */}
        <section className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              Recent Endpoint DLP Activity
            </h3>
            <span className="text-[11px] text-slate-500">Live feed synced with company security center</span>
          </div>

          {recentEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              No threats detected yet. Krypton is actively guarding Chrome, Edge, and clipboard inputs in the background.
            </div>
          ) : (
            <div className="space-y-2">
              {recentEvents.slice(0, 6).map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/40 p-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        evt.actionTaken === 'block' ? 'bg-rose-500' : 'bg-emerald-400'
                      }`}
                    />
                    <div>
                      <p className="font-semibold text-white">{evt.ruleName}</p>
                      <p className="text-[11px] text-slate-400">{evt.targetName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        evt.actionTaken === 'block'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {evt.actionTaken.toUpperCase()}
                    </span>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
