import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Mail,
  Lock,
  Globe,
  Monitor,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogOut,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  Terminal,
  Activity,
  HardDrive,
  Copy,
  Check,
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

interface TargetItem {
  id: string;
  name: string;
  domain: string;
  desktopProcess: string;
  type: 'both' | 'web';
  enabled: boolean;
  color: string;
  url: string;
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
  stats: {
    scannedCount: number;
    blockedCount: number;
    allowedCount: number;
  };
  recentEvents: SecurityEventItem[];
}

const DEFAULT_TARGETS: TargetItem[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    domain: 'chatgpt.com',
    desktopProcess: 'ChatGPT.exe',
    type: 'both',
    enabled: true,
    color: 'from-emerald-500 to-teal-600',
    url: 'https://chatgpt.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    domain: 'gemini.google.com',
    desktopProcess: 'Web browser',
    type: 'web',
    enabled: true,
    color: 'from-blue-500 to-indigo-600',
    url: 'https://gemini.google.com',
  },
  {
    id: 'claude',
    name: 'Claude AI',
    domain: 'claude.ai',
    desktopProcess: 'Claude.exe',
    type: 'both',
    enabled: true,
    color: 'from-amber-500 to-orange-600',
    url: 'https://claude.ai',
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    domain: 'copilot.microsoft.com',
    desktopProcess: 'Windows Copilot',
    type: 'both',
    enabled: true,
    color: 'from-sky-500 to-cyan-600',
    url: 'https://copilot.microsoft.com',
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    domain: 'perplexity.ai',
    desktopProcess: 'Perplexity.exe',
    type: 'both',
    enabled: true,
    color: 'from-violet-500 to-purple-600',
    url: 'https://perplexity.ai',
  },
];

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

  // Protection & Targets
  const [protectionActive, setProtectionActive] = useState(true);
  const [targets, setTargets] = useState<TargetItem[]>(DEFAULT_TARGETS);
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
          bridge.getStoredState(),
          bridge.getDeviceInfo().catch(() => ({})),
        ]);

        if (devInfo) setDeviceInfo(devInfo);

        if (state && state.token) {
          setStoredState(state);
          setIsActivated(true);
          refreshSummary();
        }
      } catch (err) {
        console.warn('Initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    }

    void loadInitial();
  }, []);

  // Poll summary for real-time stats
  useEffect(() => {
    if (!isActivated || !bridge?.getWindowsProtectionSummary) return;

    const interval = setInterval(() => {
      refreshSummary();
    }, 3000);

    return () => clearInterval(interval);
  }, [isActivated]);

  const refreshSummary = async () => {
    if (!bridge?.getWindowsProtectionSummary) return;
    try {
      const summary: ProtectionSummary = await bridge.getWindowsProtectionSummary();
      if (summary) {
        setProtectionActive(summary.active);
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
        setAuthError(res.error || 'Activation failed. Please check credentials.');
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
    if (!bridge?.logout) return;
    await bridge.logout();
    setIsActivated(false);
    setStoredState(null);
    setPasswordInput('');
  };

  const handleToggleProtection = async () => {
    const nextState = !protectionActive;
    setProtectionActive(nextState);
    if (bridge?.toggleWindowsProtection) {
      await bridge.toggleWindowsProtection(nextState);
      await refreshSummary();
    }
  };

  const handleToggleTarget = async (targetId: string) => {
    const updated = targets.map((t) => (t.id === targetId ? { ...t, enabled: !t.enabled } : t));
    setTargets(updated);
    const target = updated.find((t) => t.id === targetId);
    if (bridge?.toggleWindowsTarget && target) {
      await bridge.toggleWindowsTarget(targetId, target.enabled);
    }
  };

  const handleTestScan = async () => {
    if (!testInput.trim()) return;
    setIsTesting(true);
    try {
      if (bridge?.scanPrompt) {
        const res = await bridge.scanPrompt(testInput);
        setTestResult(res);
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
        <span className="ml-3 text-sm font-medium">Initializing Krypton Windows Agent…</span>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: AUTH / LICENSE ACTIVATION (Clean, Focused, Modern)
  // =========================================================================
  if (!isActivated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 font-sans text-slate-100 select-none">
        {/* Background glow effects */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[450px] w-[600px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-40 right-10 h-[350px] w-[450px] rounded-full bg-indigo-500/10 blur-[120px]" />

        <div className="relative w-full max-w-md rounded-2xl border border-slate-800/90 bg-[#0c1322]/95 p-8 shadow-2xl shadow-black/80 backdrop-blur-xl">
          {/* Logo & Headline */}
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-indigo-600 shadow-lg shadow-sky-500/25">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">Krypton Endpoint</h1>
            <p className="mt-1 text-xs text-slate-400">
              Zero-Extension AI DLP for Windows (Browsers & Desktop Apps)
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
                  Authenticating Device…
                </>
              ) : (
                'Activate & Enable DLP'
              )}
            </button>
          </form>

          {/* Windows Features Note */}
          <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-center">
            <p className="text-[11px] text-slate-400">
              ⚡ <strong className="text-slate-200">Windows Native Protection:</strong> Works automatically on Chrome, Edge, Firefox, Brave, and desktop AI clients without manual extension install.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: HOME DASHBOARD (Clean, Modern Security Hub)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#070b14] font-sans text-slate-100 select-none">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-[#090e1c]/90 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-md shadow-sky-500/20">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">KRYPTON ENDPOINT</h1>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/20">
                WINDOWS
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Device: {deviceInfo.deviceId || 'WIN-ENDPOINT'} · Agent v{deviceInfo.appVersion || '1.0.1'}
            </p>
          </div>
        </div>

        {/* User Badge & Logout */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs font-medium text-white">{storedState?.user?.email || 'Protected Employee'}</p>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              License Verified
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Log out of this device"
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="mx-auto max-w-6xl p-6 sm:p-8 space-y-6">
        {/* Shield Status Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-r from-[#0c162d] via-[#091122] to-[#080d1a] p-6 shadow-2xl">
          <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border transition ${
                  protectionActive
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-lg shadow-emerald-500/20'
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
              >
                {protectionActive ? <ShieldCheck className="h-9 w-9" /> : <ShieldAlert className="h-9 w-9" />}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-bold text-white">
                    {protectionActive ? 'Real-Time Protection is ACTIVE' : 'Protection is PAUSED'}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      protectionActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {protectionActive ? 'SHIELD ON' : 'DISABLED'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400 max-w-xl">
                  {protectionActive
                    ? 'Active across all Windows browsers (Chrome, Edge, Firefox, Brave) and AI desktop apps. Scanning for secrets, API keys, and sensitive data without requiring browser extensions.'
                    : 'Prompt interception is paused. Prompts to AI sites and desktop apps are currently unmonitored.'}
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleProtection}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  protectionActive ? 'bg-sky-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    protectionActive ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-medium text-slate-300">
                {protectionActive ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Total Scanned</span>
              <Activity className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{stats.scannedCount}</p>
            <p className="mt-1 text-[11px] text-slate-500">Prompts & inputs inspected</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Threats Blocked</span>
              <XCircle className="h-4 w-4 text-rose-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-400">{stats.blockedCount}</p>
            <p className="mt-1 text-[11px] text-slate-500">Sensitive leaks prevented</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Clean Allowed</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-400">{stats.allowedCount}</p>
            <p className="mt-1 text-[11px] text-slate-500">Authorized safe submissions</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Protected Targets</span>
              <Monitor className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{targets.filter((t) => t.enabled).length}</p>
            <p className="mt-1 text-[11px] text-slate-500">5 AI sites + desktop apps</p>
          </div>
        </div>

        {/* Protected Targets Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Protected AI Platforms & Desktop Apps</h3>
              <p className="text-xs text-slate-400">
                Automatic protection on any browser and official Windows desktop clients.
              </p>
            </div>
            <span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-[11px] text-sky-400">
              No Extension Needed
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {targets.map((target) => (
              <div
                key={target.id}
                className={`group rounded-2xl border p-4 transition ${
                  target.enabled
                    ? 'border-slate-800/80 bg-[#0a0f1d] hover:border-slate-700'
                    : 'border-slate-900 bg-[#080c16] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr ${target.color} shadow-md text-white`}
                    >
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{target.name}</h4>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Globe className="h-3 w-3 text-slate-500" />
                        <span>{target.domain}</span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle target */}
                  <input
                    type="checkbox"
                    checked={target.enabled}
                    onChange={() => handleToggleTarget(target.id)}
                    className="h-4 w-4 rounded accent-sky-400 cursor-pointer"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800/60 pt-2.5 text-[11px]">
                  <span className="text-slate-400">
                    App: <strong className="text-slate-300 font-mono">{target.desktopProcess}</strong>
                  </span>
                  <a
                    href={target.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Live Interactive Scanner Tester */}
        <section className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-400" />
                Live Prompt Security Tester
              </h3>
              <p className="text-xs text-slate-400">
                Test how Krypton scans and blocks sensitive secrets or allows safe prompts in real-time.
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
              placeholder="Type or paste any prompt here to see instant Krypton DLP scanner response..."
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

        {/* Recent Security Incidents / Activity */}
        <section className="rounded-2xl border border-slate-800/80 bg-[#0a0f1d] p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Recent Real-Time Activity</h3>
            <span className="text-[11px] text-slate-500">Live endpoint feed</span>
          </div>

          {recentEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              No threats detected yet. Krypton is actively guarding clipboard & inputs in the background.
            </div>
          ) : (
            <div className="space-y-2">
              {recentEvents.slice(0, 5).map((evt) => (
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
    </div>
  );
}
