'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Download,
  KeyRound,
  Laptop,
  LockKeyhole,
  ScanLine,
  Shield,
  ShieldAlert,
  Terminal,
  UserRoundCog,
} from 'lucide-react';
import windowsRelease from '@/public/downloads/windows-release.json';

const demoPrompt = 'const apiKey = "sk-proj-abc1234567890def1234567890ghij";';

export default function HomePage() {
  const [prompt, setPrompt] = useState(demoPrompt);
  const windowsDownload = {
    available: windowsRelease.available,
    downloadUrl: windowsRelease.downloadUrl || undefined,
  };
  const [macDownloads, setMacDownloads] = useState<{
    available: boolean;
    architectures?: {
      appleSilicon?: { downloadUrl: string };
      intel?: { downloadUrl: string };
    };
  }>({ available: false });
  const appleSiliconDownloadUrl = macDownloads.architectures?.appleSilicon?.downloadUrl;
  const intelDownloadUrl = macDownloads.architectures?.intel?.downloadUrl;
  const showMacDownloads = macDownloads.available && appleSiliconDownloadUrl && intelDownloadUrl;
  const hasSecret = /sk-(?:proj-)?[a-zA-Z0-9_-]{24,}/.test(prompt);

  useEffect(() => {
    fetch('/downloads/macos-release.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Mac release metadata is unavailable.');
        return response.json();
      })
      .then((release) => {
        if (
          release.available === true &&
          release.architectures?.appleSilicon?.downloadUrl &&
          release.architectures?.intel?.downloadUrl
        ) {
          setMacDownloads(release);
        }
      })
      .catch((error) => console.error('Could not load Mac download metadata:', error));
  }, []);
  const showWindowsDownload = windowsDownload.available && windowsDownload.downloadUrl;

  const redactedPrompt = prompt.replace(
    /sk-(?:proj-)?[a-zA-Z0-9_-]{24,}/g,
    '[REDACTED: API_KEY]',
  );

  return (
    <div className="overflow-hidden">
      <section className="relative border-b border-sky-400/10 px-6 pb-20 pt-24 sm:pb-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(14,165,233,0.16),transparent_58%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/[0.07] px-4 py-2 text-xs font-medium text-sky-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
              Local-first AI security for your team
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Keep sensitive data
              <span className="block bg-gradient-to-r from-sky-300 to-blue-500 bg-clip-text text-transparent">
                out of AI prompts.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Krypton scans supported AI prompts locally in Chrome and Edge using its shared browser extension.
              On Mac, activate directly in the browser; Windows activation stays connected to Krypton Desktop.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
              {showWindowsDownload ? (
                <a
                  href={windowsDownload.downloadUrl}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_0_32px_rgba(56,189,248,0.2)] transition hover:bg-sky-300"
                >
                  <Download className="h-4 w-4" />
                  Download Windows package (.zip)
                </a>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-6 py-3.5 text-sm font-semibold text-slate-500">
                  <Download className="h-4 w-4" />
                  Windows installer unavailable
                </span>
              )}
              {showMacDownloads ? (
                <>
                  <a
                    href={appleSiliconDownloadUrl}
                    download
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/[0.08] px-6 py-3.5 text-sm font-semibold text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-400/[0.14]"
                  >
                    <Download className="h-4 w-4" />
                    macOS Apple silicon
                  </a>
                  <a
                    href={intelDownloadUrl}
                    download
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/[0.08] px-6 py-3.5 text-sm font-semibold text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-400/[0.14]"
                  >
                    <Download className="h-4 w-4" />
                    macOS Intel
                  </a>
                </>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-6 py-3.5 text-sm font-semibold text-slate-500" title="The signed macOS desktop installer has not been released.">
                  <Download className="h-4 w-4" />
                  macOS Desktop DMG not released
                </span>
              )}
              <a
                href="/downloads/krypton-browser-extension.zip"
                download
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/[0.08] px-6 py-3.5 text-sm font-semibold text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-400/[0.14]"
              >
                <Download className="h-4 w-4" />
                Download Chrome/Edge extension (.zip)
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-6 py-3.5 text-sm font-medium text-slate-200 transition hover:border-sky-400/40 hover:bg-slate-800"
              >
                See how it works
                <ArrowDown className="h-4 w-4 text-sky-300" />
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Windows setup is distributed as a ZIP · macOS Desktop installer is not released
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-sky-300/15 bg-[#070d17] shadow-[0_24px_100px_rgba(2,132,199,0.12)]">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                <span className="ml-2 text-xs text-slate-500">Krypton / prompt scan</span>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
                <ScanLine className="h-3.5 w-3.5" />
                LOCAL DEMO
              </span>
            </div>
            <div className="space-y-4 p-5 sm:p-7">
              <label htmlFor="prompt-demo" className="text-xs font-medium text-slate-400">
                Try a sample prompt
              </label>
              <textarea
                id="prompt-demo"
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="w-full resize-y rounded-lg border border-slate-800 bg-[#030811] p-4 font-mono text-sm leading-6 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-400/50"
                placeholder="Paste text here to try the local demo..."
              />
              <div
                aria-live="polite"
                className={`flex items-start gap-3 rounded-lg border p-4 ${
                  hasSecret
                    ? 'border-amber-400/20 bg-amber-400/[0.06]'
                    : 'border-sky-400/15 bg-sky-400/[0.04]'
                }`}
              >
                {hasSecret ? (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                )}
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${hasSecret ? 'text-amber-200' : 'text-sky-200'}`}>
                    {hasSecret ? 'Sensitive key detected in this demo' : 'No demo key pattern detected'}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs leading-5 text-slate-400">
                    {redactedPrompt || 'Your text will appear here.'}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    This browser demo is illustrative and does not indicate system-wide website protection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-b border-slate-800/80 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Built for safer AI use</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              A clear layer between your team and AI tools.
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Krypton helps identify common secrets before they are shared, while
              giving administrators a place to manage workspaces, users, and licenses.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: ScanLine,
                title: 'Scan locally',
                text: 'The desktop app includes deterministic local rules for common API keys, credentials, and sensitive patterns.',
              },
              {
                icon: LockKeyhole,
                title: 'Redact risky values',
                text: 'Review a sanitized result before sharing. Raw prompt text is not needed for the website demo.',
              },
              {
                icon: UserRoundCog,
                title: 'Manage your team',
                text: 'Company admins can manage their workspace; platform admins can create admin accounts and issue licenses.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/[0.08] text-sky-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-b border-slate-800/80 bg-[#080e18] px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Get started</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Up and running in three steps.
            </h2>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                number: '01',
                icon: Download,
                title: 'Download the app',
                text: 'Get the Krypton installer for a Windows 10 or 11, 64-bit computer.',
              },
              {
                number: '02',
                icon: KeyRound,
                title: 'Use your team login',
                text: 'Your company admin shares your account and the company license key.',
              },
              {
                number: '03',
                icon: Terminal,
                title: 'Check protection status',
                text: 'The desktop app reports whether its operating-system network filter is installed.',
              },
            ].map(({ number, icon: Icon, title, text }) => (
              <div key={number} className="relative border-l border-sky-400/20 pl-6">
                <span className="absolute -left-[1px] top-0 h-8 w-px bg-sky-300" />
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-sky-300">{number}</span>
                  <Icon className="h-4 w-4 text-sky-300" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-10 max-w-3xl rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-center text-xs leading-5 text-slate-400">
            The app uses transparent, user-space scanning. It does not silently
            monitor keystrokes or intercept other apps. Detection depends on the
            configured rules and should not replace your organization&apos;s security controls.
          </p>
        </div>
      </section>

      <section id="download" className="scroll-mt-24 px-6 py-20 sm:py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-2xl border border-sky-300/20 bg-[radial-gradient(ellipse_at_100%_0%,rgba(14,165,233,0.12),transparent_50%),#0b111c] p-7 sm:p-10 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-sky-300">
              <Laptop className="h-4 w-4" />
              KRYPTON DESKTOP + CHROME/EDGE EXTENSION
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
              Ready to try Krypton?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Download the available package below. Browser extension activation requires signing in to Krypton Desktop first.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
            {showWindowsDownload ? (
              <a
                href={windowsDownload.downloadUrl}
                download
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                <Download className="h-4 w-4" />
                Windows installer package (.zip)
              </a>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-500">
                <Download className="h-4 w-4" />
                Windows installer unavailable
              </span>
            )}
            {showMacDownloads ? (
              <>
                <a
                  href={appleSiliconDownloadUrl}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/[0.08] px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/[0.14]"
                >
                  <Download className="h-4 w-4" />
                  macOS Apple silicon (.dmg)
                </a>
                <a
                  href={intelDownloadUrl}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/[0.08] px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/[0.14]"
                >
                  <Download className="h-4 w-4" />
                  macOS Intel (.dmg)
                </a>
              </>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-500">
                <Download className="h-4 w-4" />
                macOS Desktop DMG not released
              </span>
            )}
            <a
              href="/downloads/krypton-browser-extension.zip"
              download
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-400/[0.08] px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/[0.14]"
            >
              <Download className="h-4 w-4" />
              Browser extension ZIP
            </a>
          </div>
        </div>
        <div className="mx-auto mt-8 flex max-w-6xl flex-col justify-between gap-3 text-xs text-slate-500 sm:flex-row">
          <span>Windows setup ZIP · macOS Desktop installer is not available · activation requires a valid company license</span>
          <span>Download not starting? Check your browser&apos;s download settings.</span>
        </div>
        <p className="mx-auto mt-4 max-w-6xl text-xs leading-5 text-slate-500">
          The extension ZIP is for Chrome/Edge developer or managed installation. It is not a macOS desktop DMG; that installer is not currently built and signed.
        </p>
      </section>
    </div>
  );
}
