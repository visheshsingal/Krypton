'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Shield, Users, ArrowRight } from 'lucide-react';

export default function PricingPage() {
  return (
    <div className="py-16 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>Active Seat Allocation</span>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            Per-Seat Enterprise Licensing
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Licenses are provisioned per active employee seat. Platform Super Administrators manually assign and configure license keys with custom seat capacities and expiration dates.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto pt-4">
          {/* Starter */}
          <div className="border border-slate-200 rounded-2xl p-8 bg-slate-50 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-900">Starter Plan</h3>
              <p className="text-xs text-slate-500">For small teams or initial internal trials</p>
              <div className="pt-2">
                <span className="text-3xl font-extrabold text-slate-900">5 Seats</span>
                <span className="text-xs text-slate-500 block mt-1">Managed by Super Admin</span>
              </div>
              <ul className="space-y-3 pt-4 border-t border-slate-200 text-xs text-slate-600">
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Up to 5 active employee seats</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>2 registered devices per seat</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Built-in deterministic secret rules</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Company admin dashboard</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>72-hour offline grace protection</span>
                </li>
              </ul>
            </div>
            <Link
              href="/admin"
              className="mt-8 block text-center bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-semibold text-xs py-3 rounded-lg transition shadow-sm"
            >
              Company Admin Login
            </Link>
          </div>

          {/* Business */}
          <div className="border-2 border-emerald-500 rounded-2xl p-8 bg-white flex flex-col justify-between shadow-xl relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 font-bold text-[10px] uppercase px-3 py-0.5 rounded-full tracking-wider">
              Most Popular
            </div>
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-900">Business Plan</h3>
              <p className="text-xs text-slate-500">For mid-size companies & tech teams</p>
              <div className="pt-2">
                <span className="text-3xl font-extrabold text-slate-900">10 to 50 Seats</span>
                <span className="text-xs text-slate-500 block mt-1">Managed by Super Admin</span>
              </div>
              <ul className="space-y-3 pt-4 border-t border-slate-200 text-xs text-slate-600">
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All Starter features included</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Up to 50 active employee seats</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Custom company regex rules & keywords</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>PII & PCI-DSS compliance redaction</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Security incident export to CSV/JSON</span>
                </li>
              </ul>
            </div>
            <Link
              href="/admin"
              className="mt-8 block text-center bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-3 rounded-lg transition shadow-md"
            >
              Company Admin Login
            </Link>
          </div>

          {/* Enterprise */}
          <div className="border border-slate-200 rounded-2xl p-8 bg-slate-50 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-900">Enterprise Plan</h3>
              <p className="text-xs text-slate-500">For regulated institutions & enterprises</p>
              <div className="pt-2">
                <span className="text-3xl font-extrabold text-slate-900">Custom Seats</span>
                <span className="text-xs text-slate-500 block mt-1">Dedicated licensing quota</span>
              </div>
              <ul className="space-y-3 pt-4 border-t border-slate-200 text-xs text-slate-600">
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Custom seat & device quota</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dedicated cryptographic license key pool</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Full tenant compliance audit trails</span>
                </li>
                <li className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Enterprise architecture consultation</span>
                </li>
              </ul>
            </div>
            <Link
              href="/contact"
              className="mt-8 block text-center bg-white border border-slate-300 hover:bg-slate-100 text-slate-900 font-semibold text-xs py-3 rounded-lg transition shadow-sm"
            >
              Contact Super Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
