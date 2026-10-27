'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ArrowRight, AlertTriangle, Eye, EyeOff } from 'lucide-react';

type PortalRole = 'company_admin' | 'super_admin';

export default function PortalLogin({ role }: { role: PortalRole }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = role === 'super_admin';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.user?.role !== role) {
        throw new Error(
          isSuperAdmin
            ? 'This account does not have Super Admin access.'
            : 'Use the Super Admin login for platform administrator accounts.'
        );
      }

      localStorage.setItem('krypton_token', data.accessToken);
      localStorage.setItem('krypton_refresh_token', data.refreshToken);
      localStorage.setItem('krypton_user', JSON.stringify(data.user));
      if (data.company) {
        localStorage.setItem('krypton_company', JSON.stringify(data.company));
      } else {
        localStorage.removeItem('krypton_company');
      }

      router.push(isSuperAdmin ? '/superadmin' : '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isSuperAdmin ? 'Super Admin Login' : 'Company Admin Login'}
            </h1>
            <p className="text-xs text-slate-400">
              {isSuperAdmin ? 'Sign in to manage company workspaces and licenses' : 'Sign in to your company workspace'}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-800/70 rounded-lg flex items-center space-x-2 text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isSuperAdmin ? 'platform-admin@company.com' : 'you@company.com'}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2.5 pr-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-lg text-xs transition flex items-center justify-center space-x-2 shadow-md"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800 text-center text-xs text-slate-400">
          Company workspaces and admin accounts are provisioned by the platform superadmin.
        </div>
      </div>
    </div>
  );
}
