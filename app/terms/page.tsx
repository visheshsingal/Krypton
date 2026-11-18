'use client';

import React from 'react';

export default function TermsPage() {
  return (
    <div className="py-16 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8 text-slate-800">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Terms of Service</h1>
        <p className="text-xs text-slate-500">Effective Date: October 28, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-700">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">1. Acceptance & Licensing Terms</h2>
            <p>
              By installing, running, or accessing the Krypton AI Security & Data Governance platform, your enterprise agrees to be bound by these terms. Seat allocations and license keys are granted strictly for authorized company employees.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">2. Device License Usage</h2>
            <p>
              Active paired devices are counted per employee in groups of two: one device uses one license, two devices use one, three or four devices use two, and so on. An employee with no active paired devices uses no device license. Device pairing is limited by the company&apos;s total license capacity; an administrator separately enables employee sign-in.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">3. Integration Scope & Limitations</h2>
            <p>
              Krypton endpoint agents operate strictly within supported application boundaries and demonstration workflows. Krypton makes no warranty regarding interception of arbitrary, unintegrated third-party software outside documented configurations.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
