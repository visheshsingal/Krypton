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
} from 'lucide-react';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'logs'>('overview');

  // License Modal State
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [newSeatLimit, setNewSeatLimit] = useState(10);
  const [seatDrafts, setSeatDrafts] = useState<Record<string, number>>({});
  const [modalLoading, setModalLoading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminModalLoading, setAdminModalLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
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
    router.push('/login');
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-tight text-white">KRYPTON ROOT PLATFORM</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono uppercase font-bold">
                Super Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Platform-Wide Oversight & Seat Licensing</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-xs text-slate-400">{adminEmail}</span>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 bg-slate-900/60 border-r border-slate-800 p-4 space-y-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Platform Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('companies')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'companies'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Companies & Licenses ({companies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'logs'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>System Audit Logs</span>
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="max-w-6xl space-y-8">
              <div>
                <h1 className="text-xl font-bold text-white">System Architecture & Licensing Overview</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Global metrics across all corporate tenants on Vercel Serverless + MongoDB Atlas.
                </p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Total Companies</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalCompanies}</div>
                  <div className="text-[11px] text-emerald-400">{metrics.activeCompanies} active workspaces</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Licensed User Seats</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalLicensedSeats}</div>
                  <div className="text-[11px] text-slate-400">{metrics.totalOccupiedSeats} seats actively occupied</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Active Workstation Devices</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalDevices}</div>
                  <div className="text-[11px] text-emerald-400">Windows endpoints registered</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Blocked Security Events</div>
                  <div className="text-2xl font-extrabold text-white">{metrics.totalEvents}</div>
                  <div className="text-[11px] text-red-400">Leaked secrets intercepted</div>
                </div>
              </div>

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
            <div className="max-w-6xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white">Corporate Tenants & Seat Licenses</h1>
                  <p className="text-xs text-slate-400 mt-1">
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

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
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
                    {companies.map((comp) => (
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
            <div className="max-w-6xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-white">Global Compliance Audit Trail</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Immutable record of license creation, seat allocations, and administrative changes across all tenants.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
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
                    {auditLogs.map((log) => (
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
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-white focus:border-sky-400 focus:outline-none"
                />
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
