'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
  Terminal,
  Cpu,
  Key,
  Database,
  CreditCard,
  Building,
  CheckCircle2,
  ArrowRight,
  Layers,
  FileCheck,
} from 'lucide-react';

export default function FeaturesPage() {
  return (
    <div className="py-16 bg-white min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Core Security Engine</span>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            Deterministic AI Data-Leak Prevention
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Eliminate reliance on third-party AI APIs for secret detection. Inspect prompts with ultra-fast local deterministic patterns before any text leaves the employee workstation.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-7 space-y-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 w-fit">
              <Key className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">API Key & Provider Token Detection</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Detects standard and project-scoped OpenAI keys (<code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">sk-...</code>), Anthropic Claude keys (<code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">sk-ant-...</code>), AWS access tokens, GitHub PATs, and Slack bot tokens.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-7 space-y-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 w-fit">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Database Connection String Filtering</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Catches embedded database credentials in PostgreSQL, MongoDB, MySQL, and Redis connection URIs. Prevents developers from accidentally pasting live production credentials when asking AI for SQL query tuning.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-7 space-y-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 w-fit">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Private Keys & Passwords in Prompt</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Identifies PEM-encoded RSA, EC, and SSH private keys along with explicit hardcoded password assignment strings (<code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">password = "..."</code>).
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-7 space-y-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 w-fit">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">PII & PCI-DSS Compliance Rules</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Luhn-algorithm validated credit card numbers (Visa, MasterCard, Amex) and US Social Security Numbers are automatically detected, redacted, and flagged for security review.
            </p>
          </div>
        </div>

        {/* Multi-Tenant Governance */}
        <div id="tenancy" className="bg-slate-900 text-white rounded-2xl p-8 sm:p-10 space-y-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">
              Enterprise Multi-Tenant Isolation
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every company is completely isolated. Tenant isolation is enforced on every database query and serverless endpoint, preventing cross-tenant leakage of incidents, employees, or policies.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-800 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-emerald-400">Strict Server-Side Isolation</div>
              <div className="text-slate-400">Company ID scope enforced in serverless handlers</div>
            </div>
            <div className="space-y-1">
              <div className="font-bold text-emerald-400">Cryptographic Keys</div>
              <div className="text-slate-400">Unique high-entropy license keys per company</div>
            </div>
            <div className="space-y-1">
              <div className="font-bold text-emerald-400">Zero Raw Prompt Storage</div>
              <div className="text-slate-400">Only sanitized redactions stored in incidents</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
