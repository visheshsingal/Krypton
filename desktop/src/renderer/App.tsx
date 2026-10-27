import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Key,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Laptop,
  HelpCircle,
  FileText,
  LogOut,
  Send,
  Eye,
  EyeOff,
  Sliders,
  ExternalLink,
  Info,
} from 'lucide-react';
import { PromptScanResult } from '@krypton/shared';

const desktopBridge = (window as any).kryptonDesktop;

export default function App() {
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [storedState, setStoredState] = useState<any>(null);
  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sandbox' | 'events' | 'policy' | 'license' | 'support'>('sandbox');

  // Activation Form
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [activationLoading, setActivationLoading] = useState<boolean>(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  // Sandbox State
  const [promptText, setPromptText] = useState<string>('');
  const [scanResult, setScanResult] = useState<PromptScanResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);

  // Local Events Log
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    loadInitialState();
  }, []);

  async function loadInitialState() {
    try {
      const dev = await desktopBridge.getDeviceInfo();
      const state = await desktopBridge.getStoredState();
      setDeviceInfo(dev);
      setStoredState(state);

      if (state && state.license && state.token) {
        setIsActivated(true);
      }
    } catch (err) {
      console.error('Failed to load initial state:', err);
    }
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setActivationLoading(true);
    setActivationError(null);

    try {
      const res = await desktopBridge.activate({
        licenseKey: licenseKeyInput.trim(),
        email: emailInput.trim(),
        password: passwordInput,
      });

      if (!res.success) {
        setActivationError(res.error || 'Activation failed');
      } else {
        setIsActivated(true);
        const state = await desktopBridge.getStoredState();
        setStoredState(state || res);
        setActiveTab('sandbox');
      }
    } catch (err: any) {
      setActivationError(err.message || 'Network error connecting to backend');
    } finally {
      setActivationLoading(false);
    }
  }

  async function handleLogout() {
    await desktopBridge.logout();
    setIsActivated(false);
    setStoredState(null);
  }

  async function handleScanPrompt() {
    if (!promptText.trim()) return;
    setIsScanning(true);
    setSubmissionFeedback(null);

    try {
      const result = await desktopBridge.scanPrompt(promptText);
      setScanResult(result);

      if (result.hasRisk) {
        // Record event
        const primaryMatch = result.matches[0];
        const eventData = {
          targetApp: 'Krypton Demonstration Sandbox',
          riskLevel: result.highestRisk,
          ruleCode: primaryMatch ? primaryMatch.ruleCode : 'MULTIPLE_RULES',
          ruleName: primaryMatch ? primaryMatch.ruleName : 'Security Rule Match',
          category: primaryMatch ? primaryMatch.category : 'api_key',
          actionTaken: result.action,
          redactedPreview: result.redactedPrompt.slice(0, 300),
          explanation: result.explanation,
          timestamp: new Date().toISOString(),
        };

        const reportResult = await desktopBridge.reportEvent(eventData);
        setRecentEvents((prev) => [eventData, ...prev]);

        let scanFeedback = 'Sensitive content detected by local policy.';
        if (result.action === 'block') {
          scanFeedback = 'BLOCKED: The local policy prevented this sandbox submission.';
        } else if (result.action === 'warn') {
          scanFeedback = 'WARNING: Local policy detected sensitive content.';
        }
        if (!reportResult?.success) {
          scanFeedback += ' The server did not confirm event reporting.';
        }
        setSubmissionFeedback(scanFeedback);
      } else {
        setSubmissionFeedback('No enabled local detection rules matched this sandbox text.');
      }
    } catch (err: any) {
      console.error('Scan failed:', err);
    } finally {
      setIsScanning(false);
    }
  }

  function loadSamplePrompt(type: string) {
    if (type === 'openai') {
      setPromptText('Can you refactor this function?\nconst client = new OpenAI({ apiKey: "sk-proj-abc1234567890def1234567890ghij" });');
    } else if (type === 'aws') {
      setPromptText('AWS S3 upload script:\nprocess.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";\nprocess.env.AWS_REGION = "us-east-1";');
    } else if (type === 'db') {
      setPromptText('Database migration error on uri: "postgresql://postgres:AdminProdSecret99!@db.finance.internal:5432/core_banking"');
    } else if (type === 'safe') {
      setPromptText('How can I implement an atomic seat allocation algorithm in Node.js using MongoDB transactions?');
    }
    setScanResult(null);
    setSubmissionFeedback(null);
  }

  const platformLabel =
    deviceInfo?.platform === 'darwin'
      ? 'macOS'
      : deviceInfo?.platform === 'win32'
        ? 'Windows'
        : deviceInfo?.platform === 'linux'
          ? 'Linux'
          : 'Desktop';

  // Render Activation Screen
  if (!desktopBridge) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">Krypton desktop runtime unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">
            Activation and security scanning are only available in the installed desktop application.
          </p>
        </div>
      </div>
    );
  }

  if (!isActivated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <Shield className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Krypton AI Security</h1>
              <p className="text-xs text-slate-400">Endpoint Data Loss Prevention Agent</p>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3.5 mb-6 text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Hardware ID:</span>
              <span className="font-mono text-slate-200">{deviceInfo?.deviceId || 'Detecting...'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Workstation:</span>
              <span className="text-slate-200">{deviceInfo?.deviceName || 'Workstation'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Platform:</span>
              <span className="text-slate-200">{deviceInfo?.osVersion || 'Desktop OS'}</span>
            </div>
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Company License Key</label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="KRYP-XXXX-XXXX-XXXX-XXXX"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm font-mono text-emerald-400 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Employee Work Email</label>
              <input
                type="email"
                required
                placeholder="employee@company.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Account Password</label>
              <div className="relative">
                <input
                  type={showPasswordInput ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordInput((visible) => !visible)}
                  aria-label={showPasswordInput ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-white"
                >
                  {showPasswordInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {activationError && (
              <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-lg flex items-start space-x-2 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{activationError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={activationLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors flex items-center justify-center space-x-2"
            >
              {activationLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Validating Seat & Activating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Activate Workstation</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Krypton client connects to enterprise SaaS server to enforce server-authoritative seat limits.
          </p>
        </div>
      </div>
    );
  }

  // Render Activated Main Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white">KRYPTON DLP AGENT</span>
              <span className="ml-2 text-xs text-slate-400">
                v{deviceInfo?.appVersion || 'unknown'} · {platformLabel}
              </span>
            </div>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-medium">LOCAL PROMPT SCANNER ACTIVE</span>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="text-right">
            <div className="text-slate-200 font-medium">{storedState?.user?.name || 'Employee'}</div>
            <div className="text-slate-400">{storedState?.user?.email || 'No account'}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Deactivate workstation"
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-60 bg-slate-900/60 border-r border-slate-800 p-4 flex flex-col justify-between">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('sandbox')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'sandbox'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Prompt Security Sandbox</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Protection Status</span>
            </button>

            <button
              onClick={() => setActiveTab('events')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'events'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Blocked Events ({recentEvents.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('policy')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'policy'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Security Policies</span>
            </button>

            <button
              onClick={() => setActiveTab('license')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'license'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>License & Account</span>
            </button>

            <button
              onClick={() => setActiveTab('support')}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'support'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>Diagnostics & Architecture</span>
            </button>
          </nav>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300">Device ID:</div>
            <div className="font-mono text-[10px] text-emerald-400 truncate">{storedState?.deviceId || 'WIN-01'}</div>
            <div className="text-[10px] text-slate-500 mt-1">Offline grace: 72h active</div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          {/* TAB 1: Prompt Security Sandbox */}
          {activeTab === 'sandbox' && (
            <div className="max-w-4xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    <span>AI Prompt Security Engine — Demonstration Sandbox</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Inspects prompt content locally using deterministic secret patterns before submission to AI models.
                  </p>
                </div>
              </div>

              {/* Sample Preload Buttons */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 font-medium">Load test pattern:</span>
                <button
                  onClick={() => loadSamplePrompt('openai')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                >
                  OpenAI Secret
                </button>
                <button
                  onClick={() => loadSamplePrompt('aws')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                >
                  AWS Key
                </button>
                <button
                  onClick={() => loadSamplePrompt('db')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                >
                  PostgreSQL URI
                </button>
                <button
                  onClick={() => loadSamplePrompt('safe')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded border border-slate-700 transition"
                >
                  Safe Prompt
                </button>
              </div>

              {/* Prompt Input Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <textarea
                  rows={5}
                  value={promptText}
                  onChange={(e) => {
                    setPromptText(e.target.value);
                    setScanResult(null);
                    setSubmissionFeedback(null);
                  }}
                  placeholder="Paste code snippet, database query, or prompt text to inspect for credentials and confidential data..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs text-slate-500">
                    Deterministic inspection: API keys, Cloud tokens, DB URIs, Passwords, PII
                  </div>
                  <button
                    onClick={handleScanPrompt}
                    disabled={isScanning || !promptText.trim()}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs flex items-center space-x-1.5 transition"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Inspecting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Inspect & Validate Prompt</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Scan Results Display */}
              {scanResult && (
                <div
                  className={`border rounded-xl p-5 space-y-4 ${
                    scanResult.action === 'block'
                      ? 'bg-red-950/20 border-red-800/60'
                      : scanResult.action === 'warn'
                      ? 'bg-amber-950/20 border-amber-800/60'
                      : 'bg-emerald-950/20 border-emerald-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {scanResult.action === 'block' ? (
                        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                          <XCircle className="w-5 h-5" />
                        </div>
                      ) : scanResult.action === 'warn' ? (
                        <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-white flex items-center space-x-2">
                          <span>
                            {scanResult.action === 'block'
                              ? 'PROMPT SUBMISSION BLOCKED'
                              : scanResult.action === 'warn'
                              ? 'CONFIRMATION WARNING'
                              : 'PROMPT VERIFIED SAFE'}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                              scanResult.highestRisk === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : scanResult.highestRisk === 'HIGH'
                                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                : scanResult.highestRisk === 'MEDIUM'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            Risk: {scanResult.highestRisk}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">{scanResult.explanation}</p>
                      </div>
                    </div>
                  </div>

                  {/* Triggered Rules List */}
                  {scanResult.matches.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="text-xs font-semibold text-slate-300">Triggered Security Rules:</div>
                      <div className="space-y-1.5">
                        {scanResult.matches.map((m, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-mono text-emerald-400 font-semibold mr-2">{m.ruleCode}</span>
                              <span className="text-slate-200">{m.ruleName}</span>
                            </div>
                            <span className="text-red-400 font-medium uppercase text-[10px]">Action: {m.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Safe Redaction Preview */}
                  {scanResult.redactedPrompt && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">Redacted Prompt (Transmitted to Analytics):</span>
                        <span className="text-[10px] text-emerald-400 font-medium">Secrets Cleared</span>
                      </div>
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                        {scanResult.redactedPrompt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Protection Status */}
          {activeTab === 'dashboard' && (
            <div className="max-w-4xl space-y-6">
              <h2 className="text-lg font-bold text-white">Workstation Security Status</h2>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Agent Status</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1 flex items-center space-x-1.5">
                    <ShieldCheck className="w-5 h-5" />
                    <span>Protected</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Real-time local secret scanner active</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">License Verification</div>
                  <div className="text-lg font-bold text-white mt-1">Active Seat</div>
                  <div className="text-[11px] text-emerald-400 mt-1">Server validated</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-400">Offline Grace Period</div>
                  <div className="text-lg font-bold text-white mt-1">72 Hours</div>
                  <div className="text-[11px] text-slate-500 mt-1">Max disconnected tolerance</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Active Protection Modules</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                    <div>
                      <div className="font-medium text-slate-200">API Keys & Cloud Tokens (OpenAI, Anthropic, AWS, GitHub, Slack)</div>
                      <div className="text-slate-500">Detects and blocks platform API secrets before exfiltration</div>
                    </div>
                    <span className="text-emerald-400 font-semibold">BLOCKING</span>
                  </div>

                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                    <div>
                      <div className="font-medium text-slate-200">Database Connection Strings & Embedded Passwords</div>
                      <div className="text-slate-500">Detects PostgreSQL, MongoDB, MySQL URIs and hardcoded credentials</div>
                    </div>
                    <span className="text-emerald-400 font-semibold">BLOCKING</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-slate-200">PII & PCI-DSS (Credit Cards, Social Security Numbers)</div>
                      <div className="text-slate-500">Luhn-validated card numbers and compliance identifiers</div>
                    </div>
                    <span className="text-emerald-400 font-semibold">BLOCKING</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Recent Events */}
          {activeTab === 'events' && (
            <div className="max-w-4xl space-y-4">
              <h2 className="text-lg font-bold text-white">Blocked & Warned Security Incidents</h2>
              <p className="text-xs text-slate-400">
                Log of policy enforcement triggers detected on this workstation and reported to the company dashboard.
              </p>

              {recentEvents.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
                  No security incidents recorded yet on this workstation.
                  <div className="mt-2">
                    <button
                      onClick={() => setActiveTab('sandbox')}
                      className="text-emerald-400 hover:underline font-medium"
                    >
                      Go to Sandbox to test a secret leak &rarr;
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentEvents.map((evt, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              evt.actionTaken === 'block'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {evt.actionTaken}
                          </span>
                          <span className="font-mono text-emerald-400 font-semibold">{evt.ruleCode}</span>
                          <span className="text-slate-300 font-medium">{evt.ruleName}</span>
                        </div>
                        <span className="text-slate-500 text-[11px]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] bg-slate-950 p-2 rounded border border-slate-800/80">
                        {evt.redactedPreview}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Policy */}
          {activeTab === 'policy' && (
            <div className="max-w-4xl space-y-4">
              <h2 className="text-lg font-bold text-white">Enforced Company Policies</h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-300">Block Critical Risk Prompts</span>
                  <span className="text-emerald-400 font-semibold">Enabled</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-300">Block High Risk Prompts</span>
                  <span className="text-emerald-400 font-semibold">Enabled</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-300">Warn on Medium Risk Prompts</span>
                  <span className="text-emerald-400 font-semibold">Enabled</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-300">Secret Detection Engine</span>
                  <span className="text-emerald-400 font-semibold">Enabled (Built-in)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-300">PII & PCI Detection</span>
                  <span className="text-emerald-400 font-semibold">Enabled</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-300">Full Raw Prompt Logging</span>
                  <span className="text-slate-500 font-semibold">Disabled (Privacy Default)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: License & Account */}
          {activeTab === 'license' && (
            <div className="max-w-4xl space-y-4">
              <h2 className="text-lg font-bold text-white">License & Account Information</h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">License Key</span>
                  <span className="font-mono text-emerald-400 font-bold">{storedState?.license?.licenseKey || storedState?.licenseKey || 'KRYP-ACME-2026-SECR-8899'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Subscription Plan</span>
                  <span className="text-white font-semibold uppercase">{storedState?.license?.plan || 'Business'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Assigned Employee</span>
                  <span className="text-white">{storedState?.user?.email || 'No account'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Seat Allocation</span>
                  <span className="text-emerald-400 font-semibold">Active Server Seat Claimed</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Offline Grace Period</span>
                  <span className="text-slate-200">72 hours tolerance</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Diagnostics & Architecture */}
          {activeTab === 'support' && (
            <div className="max-w-4xl space-y-5">
              <h2 className="text-lg font-bold text-white">Diagnostics & Technical Architecture</h2>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs leading-relaxed text-slate-300">
                <div className="font-semibold text-white text-sm">Supported Workflows & Interception Boundaries</div>
                <p>
                  <strong>Internal Demonstration Workflow:</strong> Full real-time deterministic scanning, rule evaluation, risk grading, and safe redaction for code, tokens, database URIs, passwords, and PII.
                </p>
                <p>
                  <strong>External Application Interception Notice:</strong> Electron applications running in user space cannot silently intercept keystrokes or DOM elements of arbitrary third-party browsers or desktop software (such as Google Chrome, Cursor, or Slack) without OS-level kernel drivers, virtual display filters, or enterprise browser extensions.
                </p>
                <p>
                  Krypton provides transparent integration modules (browser extension manifests, API proxy relays, and internal secure prompt sandboxes) without making false claims of unsupported system-wide memory inspection.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 text-xs">
                <div className="font-semibold text-white">Hardware & Client Specs:</div>
                <div className="font-mono text-slate-400">Device ID: {deviceInfo?.deviceId}</div>
                <div className="font-mono text-slate-400">Hostname: {deviceInfo?.deviceName}</div>
                <div className="font-mono text-slate-400">OS: {deviceInfo?.osVersion}</div>
                <div className="font-mono text-slate-400">App Version: {deviceInfo?.appVersion}</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
