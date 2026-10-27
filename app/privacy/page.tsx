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
              Krypton is engineered with a strict privacy-first architecture. Prompt content evaluated on endpoint workstations is scanned locally using deterministic regular expressions. When secrets, credentials, or PII are detected, they are redacted into placeholder tokens (e.g. <code>[REDACTED: API_KEY_OPENAI]</code>) prior to any server-side incident logging.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">2. Zero Raw Secret Storage</h2>
            <p>
              Under no circumstance does Krypton store, log, or index raw plaintext passwords, cryptographic private keys, or API secrets on its cloud servers. Only sanitized incident metadata (timestamp, employee identifier, matched rule code, and redacted preview) is retained for audit compliance.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">3. Multi-Tenant Isolation</h2>
            <p>
              Company records, employee lists, device registrations, and security events are strictly isolated using tenant-scoped identifiers verified on every serverless execution. Cross-tenant data access is systematically prevented.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
