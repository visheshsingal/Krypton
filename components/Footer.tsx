'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();
  const isDashboardPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/superadmin') ||
    pathname === '/admin' ||
    pathname === '/login';

  if (isDashboardPage) return null;

  return (
    <footer className="border-t border-slate-800 bg-[#080e18] py-8 text-sm text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="space-y-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-400/10 border border-sky-300/20 flex items-center justify-center text-sky-300">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-bold text-white text-base tracking-tight">KRYPTON</span>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">
            Local-first prompt scanning to help teams identify sensitive data before sharing it with AI tools.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs">
          <Link href="/admin" className="transition hover:text-sky-300">Company Admin</Link>
          <Link href="/superadmin/login" className="transition hover:text-sky-300">Super Admin</Link>
          <Link href="/privacy" className="transition hover:text-sky-300">Privacy</Link>
          <Link href="/terms" className="transition hover:text-sky-300">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
