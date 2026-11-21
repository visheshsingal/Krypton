import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Globe,
  Monitor,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Terminal,
  Activity,
  Keyboard,
  ClipboardCheck,
  Flame,
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
    desktopProcess: 'ChatGPT.exe / Chrome',
    type: 'both',
    enabled: true,
    color: 'from-emerald-500 to-teal-600',
    url: 'https://chatgpt.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    domain: 'gemini.google.com',
    desktopProcess: 'Chrome / Edge / Web',
    type: 'web',
    enabled: true,
    color: 'from-blue-500 to-indigo-600',
    url: 'https://gemini.google.com',
  },
  {
    id: 'claude',
    name: 'Claude AI',
    domain: 'claude.ai',
    desktopProcess: 'Claude.exe / Chrome',
    type: 'both',
    enabled: true,
    color: 'from-amber-500 to-orange-600',
    url: 'https://claude.ai',
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    domain: 'copilot.microsoft.com',
    desktopProcess: 'Windows Copilot / Edge',
    type: 'both',
    enabled: true,
    color: 'from-sky-500 to-cyan-600',
    url: 'https://copilot.microsoft.com',
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    domain: 'perplexity.ai',
    desktopProcess: 'Perplexity.exe / Web',
    type: 'both',
    enabled: true,
    color: 'from-violet-500 to-purple-600',
    url: 'https://perplexity.ai',
  },
];

export default function App() {
  const bridge = (window as any).kryptonDesktop;

  // Protection state (Always active out of the box - no activation code needed)
  const [isInitializing, setIsInitializing] = useState(true);
  const [storedState, setStoredState] = useState<StoredState | null>(null);

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
          bridge.getStoredState().catch(() => null),
          bridge.getDeviceInfo().catch(() => ({})),
        ]);

        if (devInfo) setDeviceInfo(devInfo);
        if (state) setStoredState(state);

        await refreshSummary();
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
    if (!bridge?.getWindowsProtectionSummary) return;

    const interval = setInterval(() => {
      refreshSummary();
    }, 2500);

    return () => clearInterval(interval);
  }, []);

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
        <span className="ml-3 text-sm font-medium">Starting Krypton DLP Agent…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] font-sans text-slate-100 select-none">
      {/* Top Navigation Bar */}
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
              Endpoint: {deviceInfo.deviceId || 'LOCAL-PC'} · Native AI DLP
            </p>
          </div>
        </div>

        {/* Protection Mode Pill */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-white">Direct Browser & App Protection</p>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Zero Extension Needed
            </span>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Ready</span>
          </div>
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
                    ? 'Automatically protects your normal Google Chrome, Microsoft Edge, Brave, and desktop AI clients. Open ChatGPT or any AI tool yourself—typed prompts and copy-paste are scanned automatically with zero extensions or activation codes needed.'
                    : 'Interception is paused. Outgoing prompts and inputs are currently unmonitored.'}
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

        {/* 3 Pillars of Zero-Setup Protection */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/90 bg-[#0a0f1d] p-4 flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-400/25 text-sky-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Normal Browser Guard</h4>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                Open Chrome or Edge normally on your PC. No special browser profiles or &quot;Open Protected&quot; buttons needed.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-[#0a0f1d] p-4 flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-400">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Live Typing & Input DLP</h4>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                Scans text as you type directly into ChatGPT, Gemini, or Claude. Detects API keys & secrets before submission.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-[#0a0f1d] p-4 flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-400/25 text-indigo-400">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Instant Clipboard Guard</h4>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                Automatically redacts sensitive secrets if you copy or paste text destined for AI chatbots.
              </p>
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
            <p className="mt-1 text-[11px] text-slate-500">AI sites + desktop apps</p>
          </div>
        </div>

        {/* Protected Targets Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Monitored AI Platforms</h3>
              <p className="text-xs text-slate-400">
                Guarding prompts on any browser you open and native desktop applications.
              </p>
            </div>
            <span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-[11px] text-sky-400">
              Zero Configuration
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
                    Scope: <strong className="text-slate-300 font-mono">{target.desktopProcess}</strong>
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
                Live Prompt DLP Tester
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
            <span className="text-[11px] text-slate-500">Live feed from browsers & clipboard</span>
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
    </div>
  );
}
