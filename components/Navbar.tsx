'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, ArrowRight, Menu, X, User, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check if user is logged in
    const checkUser = () => {
      try {
        const stored = localStorage.getItem('krypton_user');
        if (stored) setUser(JSON.parse(stored));
        else setUser(null);
      } catch (e) {
        setUser(null);
      }
    };
    checkUser();
  }, [pathname]);

  const isDashboardPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/superadmin') ||
    pathname === '/admin' ||
    pathname === '/login';

  if (isDashboardPage) return null;

  return (
    <header className="sticky top-0 z-50 glass-nav border-b border-slate-800/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-sky-400/10 border border-sky-300/20 flex items-center justify-center text-sky-300 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-sky-300" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-white tracking-tight text-lg leading-tight">
              KRYPTON
            </span>
            <span className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase -mt-0.5">
              LOCAL AI SECURITY
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-400">
          <Link
            href="/#features"
            className="hover:text-sky-300 transition-colors"
          >
            Product
          </Link>
          <Link
            href="/#how-it-works"
            className="hover:text-sky-300 transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/#download"
            className="hover:text-sky-300 transition-colors"
          >
            Download
          </Link>
        </nav>

        {/* Action CTAs */}
        <div className="hidden md:flex items-center space-x-3.5">
          {user ? (
            <Link
              href={user.role === 'super_admin' ? '/super-admin' : '/dashboard'}
              className="inline-flex items-center space-x-2 border border-slate-700 bg-slate-900 hover:border-sky-400/40 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <User className="w-3.5 h-3.5 text-sky-300" />
              <span>{user.role === 'super_admin' ? 'Super Admin Portal' : 'Company Dashboard'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/admin"
                className="text-xs font-semibold text-slate-300 hover:text-sky-300 px-3.5 py-2 rounded-lg transition-colors"
              >
                Company Admin
              </Link>
              <Link
                href="/superadmin/login"
                className="inline-flex items-center space-x-1.5 border border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Super Admin</span>
              </Link>
              <Link
                href="/#download"
                className="inline-flex items-center space-x-1.5 bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                <span>Download app</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-[#080e18] px-4 pt-2 pb-6 space-y-3">
          <Link
            href="/#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 rounded-md"
          >
            Product
          </Link>
          <Link
            href="/#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 rounded-md"
          >
            How it works
          </Link>
          <Link
            href="/#download"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 rounded-md"
          >
            Download
          </Link>
          <div className="pt-2 border-t border-slate-800 flex flex-col space-y-2">
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="text-center py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 rounded-md"
            >
              Company Admin Login
            </Link>
            <Link
              href="/superadmin/login"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center justify-center space-x-2 py-2 text-sm font-semibold border border-sky-400/20 bg-sky-400/10 text-sky-200 rounded-md"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Super Admin Login</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
