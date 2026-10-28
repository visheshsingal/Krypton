'use client';

import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="py-16 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8 text-slate-800">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Privacy Policy</h1>
        <p className="text-xs text-slate-500">Effective Date: October 28, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-700">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">1. Client-Side Redaction & Data Minimization</h2>
            <p>
              Prompt content evaluated on endpoint workstations is scanned locally using deterministic rules. When configured rules detect sensitive values, they are replaced with placeholder tokens (e.g. <code>[REDACTED: API_KEY_OPENAI]</code>) before any optional prompt-preview logging. Detection is not exhaustive and may not recognize every sensitive value.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">2. Zero Raw Secret Storage</h2>
            <p>
              Krypton is designed not to retain values identified by its configured secret-detection rules. Incident metadata is retained for audit purposes. Redacted prompt previews can still contain text not detected by those rules, so they are disabled by default and should be enabled only with appropriate authorization and employee notice.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">3. Browser Extension</h2>
            <p>
              When an authorized user activates the Krypton Chrome or Edge extension, supported AI-site prompts are scanned locally. By default, the extension sends the site hostname and bounded event metadata for blocked submissions without prompt text. A company administrator may opt in to logging redacted prompt previews for allowed and blocked submission attempts. Those previews are redacted locally and checked again on the server, but may still contain confidential text that the configured rules do not detect. The extension checks its license and company policy with Krypton periodically and may use the last valid policy during the account's configured offline grace period.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">4. Multi-Tenant Isolation</h2>
            <p>
              Company records, employee lists, device registrations, and security events are strictly isolated using tenant-scoped identifiers verified on every serverless execution. Cross-tenant data access is systematically prevented.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">5. Optional USB Activity Metadata</h2>
            <p>
              On supported Windows devices, employees may explicitly enable removable-drive monitoring in the desktop app. When enabled, Krypton may send drive connection changes and file names, extensions, sizes, timestamps, Windows account names, device identifiers, and destination paths to the employee’s company workspace. File contents are not read or uploaded. Windows user-mode notifications do not reliably identify the source path or verify copy completion, and events may be missed if the API is unreachable. Monitoring is off by default and can be disabled in the desktop app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
