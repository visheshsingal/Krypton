'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Building2,
  Users,
  Key,
  Laptop,
  AlertTriangle,
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  FileText,
  LogOut,
  Calendar,
  Layers,
  Lock,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'logs'>('overview');
  const [companySearch, setCompanySearch] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  // License Modal State
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [newSeatLimit, setNewSeatLimit] = useState(10);
  const [seatDrafts, setSeatDrafts] = useState<Record<string, number>>({});
  const [modalLoading, setModalLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminModalLoading, setAdminModalLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminCreateError, setAdminCreateError] = useState<string | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<{
    companyName: string;
    email: string;
    licenseKey: string;
  } | null>(null);
  const [adminForm, setAdminForm] = useState({
    companyName: '',
    adminEmail: '',
    password: '',
    seatLimit: 5,
  });

  useEffect(() => {
    const token = localStorage.getItem('krypton_token');
    const userStr = localStorage.getItem('krypton_user');

    if (!token || !userStr) {
      router.push('/superadmin/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'super_admin') {
        router.push('/superadmin/login');
        return;
      }
      setAdminEmail(user.email || '');
    } catch (e) {
      router.push('/login');
      return;
    }

    fetchData(token);
  }, []);

  const fetchData = async (token: string) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [resOverview, resCompanies, resLogs] = await Promise.all([
        fetch('/api/super-admin/overview', { headers }),
        fetch('/api/super-admin/companies', { headers }),
        fetch('/api/super-admin/audit-logs', { headers }),
      ]);

      if (resOverview.ok) setOverview(await resOverview.json());
      if (resCompanies.ok) {
        const data = await resCompanies.json();
        setCompanies(data.companies || []);
      }
      if (resLogs.ok) {
        const data = await resLogs.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load Super Admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('krypton_token');
    if (!token || !selectedCompanyId) return;

    setModalLoading(true);
    try {
      const res = await fetch('/api/super-admin/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          seatLimit: newSeatLimit,
          maxDevicesPerUser: 2,
          offlineGraceHours: 72,
        }),
      });

      if (res.ok) {
        setShowLicenseModal(false);
        fetchData(token);
      } else {
        const data = await res.json();
        window.alert(data.error || 'Could not issue license.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('krypton_token');
    if (!token) {
      setAdminCreateError('Your session has expired. Sign in again to continue.');
      return;
    }

    setAdminModalLoading(true);
    setAdminCreateError(null);
    try {
      const res = await fetch('/api/super-admin/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(adminForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not create company admin.');
      }

      setCreatedAdmin({
        companyName: data.company.name,
        email: data.admin.email,
        licenseKey: data.license.licenseKey,
      });
      setShowAdminModal(false);
      setAdminForm({
        companyName: '',
        adminEmail: '',
        password: '',
        seatLimit: 5,
      });
      setActiveTab('companies');
      await fetchData(token);
    } catch (err) {
      setAdminCreateError(err instanceof Error ? err.message : 'Could not create company admin.');
    } finally {
      setAdminModalLoading(false);
    }
  };

  const handleRenewLicense = async (licenseId: string) => {
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/super-admin/licenses/${licenseId}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ months: 12 }),
      });
      if (!res.ok) {
        const data = await res.json();
        window.alert(data.error || 'Could not renew license.');
        return;
      }
      if (res.ok) {
        fetchData(token);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLicenseStatus = async (licenseId: string, currentStatus: string) => {
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/super-admin/licenses/${licenseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        window.alert(data.error || 'Could not update license status.');
        return;
      }
      fetchData(token);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCompany = async (
    companyId: string,
    updates: { status?: 'active' | 'suspended'; seatLimit?: number }
  ) => {
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    const res = await fetch(`/api/super-admin/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || 'Could not update company.');
      return;
    }
    await fetchData(token);
  };

  const handleDeleteCompany = async (company: any) => {
    if (
      !window.confirm(
        `Delete ${company.name} and its users, licenses, devices, events, and policies? This cannot be undone.`
      )
    ) {
      return;
    }

    const token = localStorage.getItem('krypton_token');
    if (!token) return;
    const res = await fetch(`/api/super-admin/companies/${company.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || 'Could not delete company.');
      return;
    }
    await fetchData(token);
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center space-x-3">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        <span className="text-sm font-medium">Loading Super Admin Platform...</span>
      </div>
    );
  }

  const metrics = overview?.metrics || {
    totalCompanies: 0,
    activeCompanies: 0,
    totalLicensedSeats: 0,
    totalOccupiedSeats: 0,
    seatUtilizationPercent: 0,
    totalDevices: 0,
    totalEvents: 0,
  };
  const filteredCompanies = companies.filter((company) => {
    const term = companySearch.toLowerCase();
    const matchesSearch = !term || [company.name, company.slug, company.adminName, company.adminEmail, company.contactEmail]
      .some((value) => String(value || '').toLowerCase().includes(term));
    const matchesStatus = !companyStatusFilter ||
      (companyStatusFilter === 'unlicensed' ? !company.license : company.status === companyStatusFilter);
    return matchesSearch && matchesStatus;
  });
  const filteredAuditLogs = auditLogs.filter((log) => {
    const term = auditSearch.toLowerCase();
    return !term || [log.action, log.actorEmail, log.actorRole, log.entityType, log.entityId, log.ipAddress]
      .some((value) => String(value || '').toLowerCase().includes(term));
  });
  const trendDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const day = date.toISOString().slice(0, 10);
    const entries = (overview?.eventTrend || []).filter((entry: any) => entry.day === day);
    return {
      day,
      label: date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
      block: entries.filter((entry: any) => entry.action === 'block').reduce((sum: number, entry: any) => sum + entry.count, 0),
      allow: entries.filter((entry: any) => entry.action === 'allow').reduce((sum: number, entry: any) => sum + entry.count, 0),
      warn: entries.filter((entry: any) => entry.action === 'warn').reduce((sum: number, entry: any) => sum + entry.count, 0),
    };
  });
  const trendMax = Math.max(1, ...trendDays.map((day) => day.block + day.allow + day.warn));

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-[#0b1220]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-gradient-to-br from-sky-300/15 to-blue-500/5 text-sky-200 shadow-[0_0_24px_rgba(56,189,248,0.08)]">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight text-white">Krypton</span>
              <span className="rounded-md border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-200">
                Platform admin
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">Global workspace management</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden max-w-48 text-right text-xs sm:block">
            <div className="truncate font-medium text-slate-200">{adminEmail}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">Super administrator</div>
          </div>
          <div className="hidden h-8 w-px bg-slate-800 sm:block" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-2 text-xs text-slate-400 transition hover:border-rose-400/20 hover:bg-rose-400/5 hover:text-rose-300"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="shrink-0 border-b border-slate-800/80 bg-[#0b1220] md:w-60 md:border-b-0 md:border-r">
          <div className="hidden px-5 pb-3 pt-6 md:block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Platform</span>
          </div>
          <nav aria-label="Super Admin dashboard" className="flex gap-1 overflow-x-auto p-2 sm:px-4 md:block md:space-y-1 md:px-3 md:pb-5 md:pt-1">
            {([
              { id: 'overview', label: 'Overview', icon: Layers },
              { id: 'companies', label: 'Companies & licenses', icon: Building2 },
              { id: 'logs', label: 'System activity', icon: FileText },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`group relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition md:w-full ${
                  activeTab === id
                    ? 'bg-sky-300/10 text-sky-100 ring-1 ring-inset ring-sky-300/15'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                }`}
              >
                {activeTab === id && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-sky-300 md:hidden" />}
                <Icon className={`h-4 w-4 shrink-0 ${activeTab === id ? 'text-sky-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span>{label}</span>
                {id === 'companies' && (
                  <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${activeTab === id ? 'bg-sky-300/10 text-sky-200' : 'bg-slate-800 text-slate-500'}`}>
                    {companies.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#070b14]">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Platform overview</h1>
                <p className="mt-1 text-sm text-slate-400">A live view of customer workspaces, seat usage, and recorded activity.</p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 space-y-1">
                  <div className="text-xs text-slate-400">Total Companies</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalCompanies}</div>
                  <div className="text-[11px] text-emerald-400">{metrics.activeCompanies} active workspaces</div>
                </div>

                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 space-y-1">
                  <div className="text-xs text-slate-400">Licensed User Seats</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalLicensedSeats}</div>
                  <div className="text-[11px] text-slate-400">{metrics.totalOccupiedSeats} seats actively occupied</div>
                </div>

                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 space-y-1">
                  <div className="text-xs text-slate-400">Active Workstation Devices</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalDevices}</div>
                  <div className="text-[11px] text-emerald-400">Windows endpoints registered</div>
                </div>

                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 space-y-1">
                  <div className="text-xs text-slate-400">Recorded security events</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalEvents}</div>
                  <div className="text-[11px] text-slate-500">All recorded policy outcomes</div>
                </div>
              </div>

              <section className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">Platform activity</h2>
                    <p className="mt-1 text-xs text-slate-500">Recorded events over the last 7 days</p>
                  </div>
                  <div className="flex gap-4 text-[11px] text-slate-400">
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400" />Allowed</span>
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />Warned</span>
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-400" />Blocked</span>
                  </div>
                </div>
                <div className="mt-6 grid h-36 grid-cols-7 items-end gap-3">
                  {trendDays.map((day) => {
                    const total = day.allow + day.warn + day.block;
                    const height = total ? Math.max(5, (total / trendMax) * 100) : 2;
                    return (
                      <div key={day.day} className="flex h-full flex-col items-center justify-end gap-2">
                        <span className="text-[10px] tabular-nums text-slate-500">{total || ''}</span>
                        <div className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md bg-slate-800/60" style={{ height: `${height}%` }} title={`${total} events`}>
                          <div className="bg-rose-400" style={{ height: `${total ? (day.block / total) * 100 : 0}%` }} />
                          <div className="bg-amber-400" style={{ height: `${total ? (day.warn / total) * 100 : 0}%` }} />
                          <div className="bg-sky-400" style={{ height: `${total ? (day.allow / total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-500">{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Companies Snapshot */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Registered Corporate Tenants</h3>
                  <button
                    onClick={() => setActiveTab('companies')}
                    className="text-xs text-emerald-400 hover:underline font-semibold"
                  >
                    View All &rarr;
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="pb-3">Company Name</th>
                        <th className="pb-3">Seats</th>
                        <th className="pb-3">License Key</th>
                        <th className="pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {companies.slice(0, 5).map((comp) => (
                        <tr key={comp.id} className="text-slate-300">
                          <td className="py-3 font-semibold text-white">{comp.name}</td>
                          <td className="py-3">
                            {comp.license ? `${comp.license.occupiedSeats} / ${comp.license.seatLimit}` : 'No license'}
                          </td>
                          <td className="py-3 font-mono text-slate-400 text-[11px]">
                            {comp.license ? comp.license.key : 'N/A'}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                comp.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {comp.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPANIES & LICENSES */}
          {activeTab === 'companies' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">Companies</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Create company admins, manage seat limits, and issue or renew licenses.
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => {
                      setAdminCreateError(null);
                      setShowAdminModal(true);
                    }}
                    className="bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold px-3.5 py-2 rounded-lg text-xs flex items-center space-x-1.5 transition shadow"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Admin + License</span>
                  </button>
                  <button
                    onClick={() => setShowLicenseModal(true)}
                    className="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center space-x-1.5 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Issue License</span>
                  </button>
                </div>
              </div>

              {createdAdmin && (
                <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-4 text-xs">
                  <div className="font-bold text-sky-200">Admin and license created for {createdAdmin.companyName}</div>
                  <div className="mt-2 text-slate-300">Login username: <span className="font-mono">{createdAdmin.email}</span></div>
                  <div className="mt-1 break-all text-slate-300">License key: <span className="font-mono text-sky-300">{createdAdmin.licenseKey}</span></div>
                  <p className="mt-2 text-slate-400">Share the password you set in the form and this license key with the company admin.</p>
                  <button onClick={() => setCreatedAdmin(null)} className="mt-3 text-slate-400 underline underline-offset-2 hover:text-white">
                    Dismiss
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Search companies or admin contacts" className="w-full rounded-xl border border-slate-800 bg-[#0b1220] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none" />
                </div>
                <select value={companyStatusFilter} onChange={(e) => setCompanyStatusFilter(e.target.value)} aria-label="Filter companies by status" className="rounded-xl border border-slate-800 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-200 sm:w-48">
                  <option value="">All companies</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="unlicensed">Unlicensed</option>
                </select>
                <span className="self-center text-xs text-slate-500">{filteredCompanies.length} of {companies.length}</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Company</th>
                      <th className="p-4">Admin Contact</th>
                      <th className="p-4">Seat Allocation</th>
                      <th className="p-4">License Key</th>
                      <th className="p-4">Expires</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredCompanies.length === 0 ? (
                      <tr><td colSpan={7} className="p-10 text-center text-sm text-slate-500">No companies match these filters.</td></tr>
                    ) : filteredCompanies.map((comp) => (
                      <tr key={comp.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="p-4 font-bold text-white">{comp.name}</td>
                        <td className="p-4 text-slate-400">
                          <div>{comp.adminName}</div>
                          <div className="text-[11px] text-slate-500">{comp.adminEmail}</div>
                        </td>
                        <td className="p-4">
                          {comp.license ? (
                            <div>
                              <span className="font-bold text-white">{comp.license.occupiedSeats}</span>
                              <span className="text-slate-500"> / {comp.license.seatLimit} seats</span>
                              <div className="mt-2 flex items-center gap-1">
                                <input
                                  aria-label={`License count for ${comp.name}`}
                                  type="number"
                                  min={Math.max(1, comp.license.occupiedSeats)}
                                  max={100000}
                                  value={seatDrafts[comp.id] ?? comp.license.seatLimit}
                                  onChange={(e) =>
                                    setSeatDrafts({ ...seatDrafts, [comp.id]: Number(e.target.value) })
                                  }
                                  className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white"
                                />
                                <button
                                  onClick={() =>
                                    handleUpdateCompany(comp.id, {
                                      seatLimit: seatDrafts[comp.id] ?? comp.license.seatLimit,
                                    })
                                  }
                                  className="rounded border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-400/20"
                                >
                                  Save
                                </button>
                              </div>
                              <div className="w-24 bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                                <div
                                  className="bg-emerald-400 h-1.5 rounded-full"
                                  style={{
                                    width: `${Math.min(100, (comp.license.occupiedSeats / comp.license.seatLimit) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-amber-400">Unlicensed</span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-emerald-400 text-[11px]">
                          {comp.license?.key || 'None'}
                        </td>
                        <td className="p-4 text-slate-400 text-[11px]">
                          {comp.license ? new Date(comp.license.expiresAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <span
                              className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                comp.status === 'active'
                                  ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                                  : 'border-red-500/30 bg-red-500/20 text-red-400'
                              }`}
                            >
                              Company {comp.status}
                            </span>
                            <div>
                              <span className="text-[10px] uppercase text-slate-400">
                                License {comp.license?.status || 'none'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {comp.license && (
                            <>
                              <button
                                onClick={() => handleToggleLicenseStatus(comp.license.id, comp.license.status)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] border border-slate-700 transition"
                              >
                                {comp.license.status === 'active' ? 'Suspend' : 'Activate'}
                              </button>
                              <button
                                onClick={() => handleRenewLicense(comp.license.id)}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[11px] border border-emerald-500/20 transition"
                              >
                                +1 Year
                              </button>
                            </>
                          )}
                          <button
                            onClick={() =>
                              handleUpdateCompany(comp.id, {
                                status: comp.status === 'active' ? 'suspended' : 'active',
                              })
                            }
                            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded text-[11px] border border-amber-500/20 transition"
                          >
                            {comp.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button
                            onClick={() => handleDeleteCompany(comp)}
                            className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded text-[11px] border border-red-500/20 transition"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">System activity</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Immutable record of license creation, seat allocations, and administrative changes across all tenants.
                </p>
              </div>

              <div className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} placeholder="Search action, actor, target, or IP" className="w-full rounded-xl border border-slate-800 bg-[#0b1220] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none" />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Actor</th>
                      <th className="p-4">Target Entity</th>
                      <th className="p-4">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAuditLogs.length === 0 ? (
                      <tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">No activity matches this search.</td></tr>
                    ) : filteredAuditLogs.map((log) => (
                      <tr key={log._id || log.id} className="text-slate-300">
                        <td className="p-4 text-slate-500 font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-400">{log.action}</td>
                        <td className="p-4 text-white">
                          {log.actorEmail} ({log.actorRole})
                        </td>
                        <td className="p-4 text-slate-400">
                          {log.entityType} {log.entityId ? `[${log.entityId.slice(0, 10)}...]` : ''}
                        </td>
                        <td className="p-4 font-mono text-slate-500 text-[11px]">{log.ipAddress || 'Internal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4">
          <div className="my-8 w-full max-w-lg space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Create company admin</h3>
                <p className="mt-1 text-slate-400">Creates a workspace, login, and 1-year license.</p>
              </div>
              <button onClick={() => setShowAdminModal(false)} className="font-bold text-slate-400 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>

            {adminCreateError && (
              <div role="alert" className="rounded-lg border border-red-800/70 bg-red-950/40 p-3 text-red-300">
                {adminCreateError}
              </div>
            )}

            <form onSubmit={handleCreateAdmin} className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-300">Company name</label>
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={adminForm.companyName}
                  onChange={(e) => setAdminForm({ ...adminForm, companyName: e.target.value })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-300">Admin email (login username)</label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={adminForm.adminEmail}
                  onChange={(e) => setAdminForm({ ...adminForm, adminEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-300">Initial password (minimum 8 characters)</label>
                <div className="relative">
                  <input
                    required
                    type={showAdminPassword ? 'text' : 'password'}
                    minLength={8}
                    autoComplete="new-password"
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 pr-10 text-white focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((visible) => !visible)}
                    aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-white"
                  >
                    {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-300">Number of licenses / seats</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={100000}
                  value={adminForm.seatLimit}
                  onChange={(e) => setAdminForm({ ...adminForm, seatLimit: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="rounded-lg bg-slate-800 px-3.5 py-2 font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminModalLoading}
                  className="rounded-lg bg-sky-400 px-4 py-2 font-bold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
                >
                  {adminModalLoading ? 'Creating...' : 'Create Admin + License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue License Modal */}
      {showLicenseModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Issue Company License</h3>
              <button
                onClick={() => setShowLicenseModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLicense} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Select Company</label>
                <select
                  required
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Choose Corporate Workspace --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.contactEmail})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Seat Limit</label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={newSeatLimit}
                  onChange={(e) => setNewSeatLimit(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowLicenseModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading || !selectedCompanyId}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg"
                >
                  {modalLoading ? 'Generating...' : 'Generate & Assign Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
