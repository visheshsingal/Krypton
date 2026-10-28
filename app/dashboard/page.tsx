'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  Laptop,
  HardDrive,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  XCircle,
  CheckCircle2,
  LogOut,
  Send,
  Download,
  Building,
  UserCheck,
  UserX,
  Search,
  Filter,
} from 'lucide-react';

export default function CompanyDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [companyData, setCompanyData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [usbEvents, setUsbEvents] = useState<any[]>([]);
  const [usbMonitoredDevices, setUsbMonitoredDevices] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'devices' | 'incidents' | 'usb'>('overview');
  const [policySaveError, setPolicySaveError] = useState<string | null>(null);

  // Filter state for incidents
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [teamSearch, setTeamSearch] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [usbSearch, setUsbSearch] = useState('');
  const [usbEventFilter, setUsbEventFilter] = useState('');

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [newRuleCode, setNewRuleCode] = useState('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleRisk, setNewRuleRisk] = useState<'HIGH' | 'CRITICAL' | 'MEDIUM'>('HIGH');

  useEffect(() => {
    const token = localStorage.getItem('krypton_token');
    const userStr = localStorage.getItem('krypton_user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.role === 'super_admin') {
        router.push('/super-admin');
        return;
      }
    } catch (e) {
      router.push('/login');
      return;
    }

    fetchCompanyData(token);
  }, []);

  const fetchCompanyData = async (token: string) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [resOverview, resEmp, resDev, resPol, resEvt, resAna, resUsb] = await Promise.all([
        fetch('/api/company/overview', { headers }),
        fetch('/api/company/employees', { headers }),
        fetch('/api/company/devices', { headers }),
        fetch('/api/company/policy', { headers }),
        fetch('/api/company/events', { headers }),
        fetch('/api/company/analytics', { headers }),
        fetch('/api/company/usb-events', { headers }),
      ]);

      if (resOverview.ok) setCompanyData(await resOverview.json());
      if (resEmp.ok) {
        const d = await resEmp.json();
        setEmployees(d.employees || []);
        setPendingInvitations(d.pendingInvitations || []);
      }
      if (resDev.ok) {
        const d = await resDev.json();
        setDevices(d.devices || []);
      }
      if (resPol.ok) {
        const d = await resPol.json();
        setPolicy(d.policy || null);
      }
      if (resEvt.ok) {
        const d = await resEvt.json();
        setEvents(d.events || []);
      }
      if (resAna.ok) {
        setAnalytics(await resAna.json());
      }
      if (resUsb.ok) {
        const data = await resUsb.json();
        setUsbEvents(data.events || []);
        setUsbMonitoredDevices(data.monitoredDevices || []);
      }
    } catch (err) {
      console.error('Failed to load company data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    setInviteLoading(true);
    setInviteMessage(null);

    try {
      const res = await fetch('/api/company/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          assignLicense: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invitation failed');

      setInviteMessage(`Invitation sent to ${inviteEmail}`);
      setInviteName('');
      setInviteEmail('');
      fetchCompanyData(token);
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteMessage(null);
      }, 1500);
    } catch (err: any) {
      setInviteMessage(`Error: ${err.message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleToggleEmployeeActive = async (userId: string, currentActive: boolean) => {
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    try {
      await fetch(`/api/company/employees/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      fetchCompanyData(token);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveEmployee = async (userId: string) => {
    if (!confirm('Remove this employee? Their active seat will be released atomically back to the pool.')) {
      return;
    }
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    try {
      await fetch(`/api/company/employees/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchCompanyData(token);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Revoke this device? The workstation will be barred from validating prompts.')) {
      return;
    }
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    try {
      await fetch(`/api/company/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchCompanyData(token);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeExtension = async (deviceId: string) => {
    if (!confirm('Disable this browser extension? Only a company administrator can re-enable it.')) return;
    const token = localStorage.getItem('krypton_token');
    if (!token) return;
    try {
      const response = await fetch('/api/desktop/extension/session', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceId, action: 'admin_disable' }),
      });
      const result = await response.json();
      if (!response.ok) {
        window.alert(result.error || 'Could not disable the browser extension.');
        return;
      }
      await fetchCompanyData(token);
    } catch (error) {
      console.error('Could not disable browser extension:', error);
      window.alert('Could not reach Krypton. The browser extension was not disabled.');
    }
  };

  const handleReauthorizeExtension = async (deviceId: string) => {
    if (!confirm('Allow this browser extension to register again? The browser user must activate it again.')) return;
    const token = localStorage.getItem('krypton_token');
    if (!token) return;
    try {
      const response = await fetch('/api/desktop/extension/session', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceId }),
      });
      const result = await response.json();
      if (!response.ok) {
        window.alert(result.error || 'Could not re-enable browser registration.');
        return;
      }
      await fetchCompanyData(token);
    } catch (error) {
      console.error('Could not re-enable browser extension:', error);
      window.alert('Could not reach Krypton. Browser registration was not re-enabled.');
    }
  };

  const handleTogglePolicy = async (field: string, currentVal: boolean) => {
    const token = localStorage.getItem('krypton_token');
    if (!token || !policy) return;

    const updated = { ...policy, [field]: !currentVal };
    setPolicy(updated);
    setPolicySaveError(null);

    try {
      const response = await fetch('/api/company/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: !currentVal }),
      });
      if (!response.ok) throw new Error('Could not save this setting. Please try again.');
    } catch (e) {
      setPolicy({ ...updated, [field]: currentVal });
      setPolicySaveError(e instanceof Error ? e.message : 'Could not save this setting. Please try again.');
    }
  };

  const handleAddCustomRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('krypton_token');
    if (!token || !policy) return;

    const newRule = {
      ruleCode: newRuleCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      name: newRuleName.trim(),
      description: 'Custom corporate sensitive pattern',
      category: 'custom_keyword',
      pattern: newRulePattern.trim(),
      riskLevel: newRuleRisk,
      action: 'block',
      isEnabled: true,
      isBuiltIn: false,
      explanation: `Internal company rule ${newRuleCode} triggered.`,
    };

    const updatedRules = [...(policy.customRules || []), newRule];

    try {
      const res = await fetch('/api/company/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ customRules: updatedRules }),
      });
      if (res.ok) {
        setPolicy({ ...policy, customRules: updatedRules });
        setNewRuleCode('');
        setNewRuleName('');
        setNewRulePattern('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportCSV = () => {
    if (events.length === 0) return;
    const headers = ['Timestamp', 'Employee', 'Email', 'Device', 'Target App', 'Risk Level', 'Rule Code', 'Action', 'Redacted Snippet'];
    const rows = events.map((e) => [
      `"${e.timestamp}"`,
      `"${e.userName}"`,
      `"${e.userEmail}"`,
      `"${e.deviceName}"`,
      `"${e.targetApp}"`,
      `"${e.riskLevel}"`,
      `"${e.ruleCode}"`,
      `"${e.actionTaken}"`,
      `"${(e.redactedPreview || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `krypton_security_events_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center space-x-3">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        <span className="text-sm font-medium">Connecting to Corporate Workspace...</span>
      </div>
    );
  }

  const license = companyData?.license;
  const company = companyData?.company;
  const stats = companyData?.stats;

  const filteredEvents = events.filter((e) => {
    if (severityFilter && e.riskLevel !== severityFilter) return false;
    if (actionFilter && e.actionTaken !== actionFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        [e.userEmail, e.ruleCode, e.ruleName, e.deviceName, e.userName]
          .some((value) => String(value || '').toLowerCase().includes(term))
      );
    }
    return true;
  });
  const filteredEmployees = employees.filter((emp) =>
    [emp.name, emp.email, emp.role].some((value) => String(value || '').toLowerCase().includes(teamSearch.toLowerCase()))
  );
  const filteredDevices = devices.filter((dev) =>
    [dev.deviceName, dev.user?.name, dev.user?.email, dev.extension?.browser]
      .some((value) => String(value || '').toLowerCase().includes(deviceSearch.toLowerCase()))
  );
  const filteredUsbEvents = usbEvents.filter((event) => {
    if (usbEventFilter && event.eventType !== usbEventFilter) return false;
    const term = usbSearch.trim().toLowerCase();
    return !term || [
      event.userName, event.userEmail, event.windowsUser, event.deviceName, event.deviceId,
      event.driveLetter, event.volumeLabel, event.deviceModel, event.deviceSerial,
      event.fileName, event.extension, event.destinationPath, ...(event.alertReasons || []),
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });
  const trendDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const day = date.toISOString().slice(0, 10);
    const entries = (analytics?.eventTrend || []).filter((entry: any) => entry.day === day);
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
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-[#0b1220]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-gradient-to-br from-sky-300/15 to-blue-500/5 text-sky-200 shadow-[0_0_24px_rgba(56,189,248,0.08)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-white">{company?.name || 'Company Workspace'}</span>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Security workspace
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/download"
            className="hidden items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/15 sm:flex"
          >
            <Download className="h-3.5 w-3.5 text-sky-300" />
            <span>Download app</span>
          </Link>
          <div className="hidden h-8 w-px bg-slate-800 sm:block" />
          <div className="hidden max-w-48 text-right text-xs lg:block">
            <div className="truncate font-medium text-slate-200">{company?.contactEmail}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">Workspace admin</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-2 text-xs text-slate-400 transition hover:border-rose-400/20 hover:bg-rose-400/5 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        <aside className="shrink-0 border-b border-slate-800/80 bg-[#0b1220] md:w-60 md:border-b-0 md:border-r">
          <div className="hidden px-5 pb-3 pt-6 md:block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Workspace</span>
          </div>
          <nav aria-label="Company dashboard" className="flex gap-1 overflow-x-auto p-2 sm:px-4 md:block md:space-y-1 md:px-3 md:pb-5 md:pt-1">
            {([
              { id: 'overview', label: 'Overview', icon: Shield },
              { id: 'employees', label: 'Team', icon: Users },
              { id: 'devices', label: 'Devices', icon: Laptop },
              { id: 'incidents', label: 'Activity', icon: AlertTriangle },
              { id: 'usb', label: 'USB activity', icon: HardDrive },
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
                <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
                <p className="mt-1 text-sm text-slate-400">A quick look at your team’s protection and license usage.</p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-sm font-medium text-slate-300">Team seats</span>
                    <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
                      {license?.occupiedSeats || 0}{' '}
                      <span className="text-base font-normal text-slate-500">
                        of {license?.seatLimit || 0}
                      </span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <div className="text-xs text-slate-500">Available</div>
                    <div className="mt-1 text-lg font-semibold text-sky-300">{license?.availableSeats || 0}</div>
                  </div>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, ((license?.occupiedSeats || 0) / (license?.seatLimit || 1)) * 100)}%`,
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    License <span className="ml-1 font-medium capitalize text-slate-300">{license?.status || 'active'}</span>
                  </span>
                  {license?.expiresAt && (
                    <span>Renews / expires {new Date(license.expiresAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800/80 bg-[#0b1220] p-5">
                  <div className="text-sm text-slate-400">Active devices</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {devices.filter((device) => device.status === 'active').length}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0b1220] p-5">
                  <div className="text-sm text-slate-400">Blocked submissions</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{analytics?.actionCounts?.block || 0}</div>
                </div>

                <div className="rounded-xl border border-slate-800/80 bg-[#0b1220] p-5">
                  <div className="text-sm text-slate-400">Allowed submissions</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{analytics?.actionCounts?.allow || 0}</div>
                </div>
              </div>

              <section className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">Submission activity</h2>
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

              <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">Recent activity</h2>
                  <button
                    onClick={() => setActiveTab('incidents')}
                    className="text-xs font-medium text-sky-300 hover:text-sky-200"
                  >
                    View all
                  </button>
                </div>

                {events.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    No activity yet. Events will appear here when an active device reports them.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70">
                    {events.slice(0, 4).map((evt) => (
                      <div
                        key={evt.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                evt.actionTaken === 'block'
                                  ? 'bg-red-400/10 text-red-300'
                                  : evt.actionTaken === 'allow'
                                    ? 'bg-emerald-400/10 text-emerald-300'
                                    : 'bg-amber-400/10 text-amber-300'
                              }`}
                            >
                              {evt.actionTaken}
                            </span>
                            <span className="truncate font-medium text-slate-200">{evt.userName}</span>
                            <span className="text-slate-500">{evt.targetApp}</span>
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {evt.ruleName}{evt.redactedPreview?.startsWith('[Prompt withheld') ? '' : ` · ${evt.redactedPreview}`}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500">{new Date(evt.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEES */}
          {activeTab === 'employees' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">Team</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Manage employee access and assigned seats.
                  </p>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 rounded-lg bg-sky-400 px-3.5 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  <Plus className="w-4 h-4" />
                  <span>Invite</span>
                </button>
              </div>

              {/* Employees Table */}
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} placeholder="Search name, email, or role" className="w-full rounded-xl border border-slate-800 bg-[#0b1220] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none" />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Employee</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Seat Status</th>
                      <th className="p-4">Active Devices</th>
                      <th className="p-4">Joined Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-sm text-slate-500">
                          No team members yet. Invite someone to get started.
                        </td>
                      </tr>
                    ) : filteredEmployees.length === 0 ? (
                      <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500">No team members match this search.</td></tr>
                    ) : filteredEmployees.map((emp) => (
                      <tr key={emp.membershipId} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="p-4">
                          <div className="font-bold text-white">{emp.name}</div>
                          <div className="text-[11px] text-slate-500">{emp.email}</div>
                        </td>
                        <td className="p-4 capitalize text-slate-400 font-mono text-[11px]">{emp.role}</td>
                        <td className="p-4">
                          {emp.hasSeat ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active Seat</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Unassigned</span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-slate-300">{emp.deviceCount} registered</td>
                        <td className="p-4 text-slate-500 font-mono text-[11px]">
                          {new Date(emp.joinedAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => handleToggleEmployeeActive(emp.userId, emp.isActive)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] border border-slate-700 transition"
                          >
                            {emp.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleRemoveEmployee(emp.userId)}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition"
                            title="Remove employee & release seat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pending Invitations Table */}
              {pendingInvitations.length > 0 && (
                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Pending invitations</h2>
                  <div className="divide-y divide-slate-800 text-xs">
                    {pendingInvitations.map((inv) => (
                      <div key={inv.id} className="py-2.5 flex items-center justify-between text-slate-400">
                        <div>
                          <span className="font-semibold text-white">{inv.name}</span> ({inv.email})
                        </div>
                        <span className="text-amber-400 text-[11px]">Pending Acceptance</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DEVICES */}
          {activeTab === 'devices' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Devices</h1>
                <p className="mt-1 text-sm text-slate-400">
                  See connected devices and manage access.
                </p>
              </div>

              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={deviceSearch} onChange={(e) => setDeviceSearch(e.target.value)} placeholder="Search device, user, or browser" className="w-full rounded-xl border border-slate-800 bg-[#0b1220] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none" />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Device Name</th>
                      <th className="p-4">Assigned User</th>
                      <th className="p-4">Browser Extension</th>
                      <th className="p-4">Last active</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {devices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-sm text-slate-500">
                          No devices have connected yet.
                        </td>
                      </tr>
                    ) : filteredDevices.length === 0 ? (
                      <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500">No devices match this search.</td></tr>
                    ) : filteredDevices.map((dev) => (
                      <tr key={dev.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="p-4 font-bold text-white flex items-center space-x-2">
                          <Laptop className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{dev.deviceName}</span>
                        </td>
                        <td className="p-4 text-slate-300">{dev.user?.name || dev.user?.email || 'N/A'}</td>
                        <td className="p-4 text-[11px]">
                          <span className={dev.extension?.protectionActive ? 'text-emerald-300' : 'text-slate-500'}>
                            {dev.extension?.status || 'Not Installed'}
                          </span>
                          {dev.extension?.browser && (
                            <span className="ml-1 text-slate-500">
                              ({dev.extension.browser === 'chrome' ? 'Chrome' : 'Edge'})
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-500 font-mono text-[11px]">
                          {dev.lastHeartbeatAt ? new Date(dev.lastHeartbeatAt).toLocaleString() : '—'}
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              dev.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {dev.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {dev.extension?.adminRevoked && (
                            <button
                              onClick={() => handleReauthorizeExtension(dev.deviceId)}
                              className="mr-2 rounded border border-emerald-700/60 bg-emerald-950/30 px-2.5 py-1 text-[11px] text-emerald-200 transition hover:bg-emerald-900/50"
                            >
                              Allow registration
                            </button>
                          )}
                          {dev.extension?.installed && !dev.extension?.adminRevoked && (
                            <button
                              onClick={() => handleRevokeExtension(dev.deviceId)}
                              className="mr-2 rounded border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 text-[11px] text-amber-200 transition hover:bg-amber-900/50"
                            >
                              Disable extension
                            </button>
                          )}
                          {dev.status === 'active' && (
                            <button
                              onClick={() => handleRevokeDevice(dev.id)}
                              className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 rounded text-[11px] transition"
                            >
                              Revoke Access
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: POLICY */}
          {false && (
            <div className="max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-white">Workstation Protection Policies</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Configure enforcement thresholds, risk rules, and proprietary company keywords.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
                <h3 className="font-bold text-white text-sm">Risk Enforcement Triggers</h3>
                <div className="divide-y divide-slate-800">
                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Block Critical Risk Prompts</div>
                      <div className="text-slate-500">API keys, cloud tokens, database connection URIs, private keys</div>
                    </div>
                    <button
                      onClick={() => handleTogglePolicy('blockCriticalRisk', policy?.blockCriticalRisk)}
                      className={`px-3 py-1.5 rounded font-bold uppercase text-[10px] transition ${
                        policy?.blockCriticalRisk ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {policy?.blockCriticalRisk ? 'Active (Block)' : 'Disabled'}
                    </button>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Block High Risk Prompts</div>
                      <div className="text-slate-500">Plaintext passwords, payment cards, Social Security Numbers</div>
                    </div>
                    <button
                      onClick={() => handleTogglePolicy('blockHighRisk', policy?.blockHighRisk)}
                      className={`px-3 py-1.5 rounded font-bold uppercase text-[10px] transition ${
                        policy?.blockHighRisk ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {policy?.blockHighRisk ? 'Active (Block)' : 'Disabled'}
                    </button>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">Warn on Medium Risk Content</div>
                      <div className="text-slate-500">Internal corporate email lists, staging server hostnames</div>
                    </div>
                    <button
                      onClick={() => handleTogglePolicy('warnMediumRisk', policy?.warnMediumRisk)}
                      className={`px-3 py-1.5 rounded font-bold uppercase text-[10px] transition ${
                        policy?.warnMediumRisk ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {policy?.warnMediumRisk ? 'Active (Warn)' : 'Disabled'}
                    </button>
                  </div>

                  <div className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-200">Log redacted AI prompt previews</div>
                      <div className="max-w-2xl text-slate-500">
                        When enabled, the dashboard records allowed and blocked submission attempts. Built-in and
                        company-defined patterns are redacted locally and checked again by the server. Other prompt
                        text may still contain confidential information. Off by default.
                      </div>
                    </div>
                    <button
                      onClick={() => handleTogglePolicy(
                        'redactedPromptLoggingEnabled',
                        policy?.redactedPromptLoggingEnabled === true,
                      )}
                      className={`shrink-0 rounded px-3 py-1.5 text-[10px] font-bold uppercase transition ${
                        policy?.redactedPromptLoggingEnabled
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {policy?.redactedPromptLoggingEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom Regex Rules Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
                <h3 className="font-bold text-white text-sm">Add Company-Specific Sensitive Pattern</h3>
                <form onSubmit={handleAddCustomRule} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Rule Code</label>
                    <input
                      type="text"
                      required
                      placeholder="CUSTOM_PROJECT_APOLLO"
                      value={newRuleCode}
                      onChange={(e) => setNewRuleCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Rule Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Project Apollo Trade Secret"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">Regex Pattern / Keyword</label>
                    <input
                      type="text"
                      required
                      placeholder="project-apollo-v[0-9]+|apollo_secret_model"
                      value={newRulePattern}
                      onChange={(e) => setNewRulePattern(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Risk Level</label>
                    <select
                      value={newRuleRisk}
                      onChange={(event) => setNewRuleRisk(event.target.value as 'HIGH' | 'CRITICAL' | 'MEDIUM')}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="MEDIUM">Medium (warn before submission)</option>
                      <option value="HIGH">High (block)</option>
                      <option value="CRITICAL">Critical (block)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-2 rounded-lg transition"
                    >
                      Save Custom Rule
                    </button>
                  </div>
                </form>

                {/* Existing Custom Rules */}
                {policy?.customRules && policy.customRules.length > 0 && (
                  <div className="pt-4 border-t border-slate-800 space-y-2">
                    <div className="font-semibold text-slate-300">Configured Custom Rules:</div>
                    {policy.customRules.map((cr: any, i: number) => (
                      <div
                        key={i}
                        className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono text-emerald-400 font-bold mr-2">{cr.ruleCode}</span>
                          <span className="text-slate-300">{cr.name}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{cr.pattern}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: INCIDENTS */}
          {activeTab === 'incidents' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">Activity</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Prompt submission attempts reported by connected browsers and devices.
                  </p>
                </div>
                <button
                  onClick={handleExportCSV}
                  disabled={events.length === 0}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3.5 py-2.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              </div>

              <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800/80 bg-[#0b1220] p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-medium text-slate-200">Redacted prompt previews</div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    Optional. When enabled, allowed and blocked attempts are logged with known sensitive values redacted.
                    Unrecognized confidential text may remain. Off by default.
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={policy?.redactedPromptLoggingEnabled === true}
                  onClick={() => handleTogglePolicy(
                    'redactedPromptLoggingEnabled',
                    policy?.redactedPromptLoggingEnabled === true,
                  )}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    policy?.redactedPromptLoggingEnabled
                      ? 'bg-sky-300 text-slate-950 hover:bg-sky-200'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {policy?.redactedPromptLoggingEnabled ? 'Enabled' : 'Enable previews'}
                </button>
              </div>
              {policySaveError && (
                <p role="alert" className="text-sm text-red-300">{policySaveError}</p>
              )}

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/80 bg-[#0b1220] p-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by employee, rule code, device..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                >
                  <option value="">All Risk Levels</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  aria-label="Filter by action"
                  className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                >
                  <option value="">All actions</option>
                  <option value="allow">Allowed</option>
                  <option value="warn">Warned</option>
                  <option value="block">Blocked</option>
                </select>
              </div>

              {/* Incidents Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Employee</th>
                      <th className="p-4">Workflow / Target</th>
                      <th className="p-4">Risk Level</th>
                      <th className="p-4">Detection</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Redacted Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-sm text-slate-500">
                          No activity matches these filters.
                        </td>
                      </tr>
                    ) : filteredEvents.map((evt) => (
                      <tr key={evt.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="p-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(evt.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-white">{evt.userName}</div>
                          <div className="text-[11px] text-slate-500">{evt.userEmail}</div>
                        </td>
                        <td className="p-4 text-slate-400">{evt.targetApp}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              evt.riskLevel === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-400'
                                : evt.riskLevel === 'HIGH'
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {evt.riskLevel}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-emerald-400 font-bold">{evt.ruleCode}</td>
                        <td
                          className={`p-4 font-bold uppercase text-[10px] ${
                            evt.actionTaken === 'block'
                              ? 'text-red-400'
                              : evt.actionTaken === 'allow'
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {evt.actionTaken}
                        </td>
                        <td className="p-4 font-mono text-[11px] text-slate-300 max-w-md">
                          <details>
                            <summary className="cursor-pointer truncate text-sky-300">
                              {evt.redactedPreview === '[Prompt withheld; sensitive content blocked locally]'
                                ? 'Prompt withheld'
                                : 'View redacted prompt'}
                            </summary>
                            <pre className="mt-2 max-h-48 max-w-md overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-slate-300">
                              {evt.redactedPreview}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'usb' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">USB activity</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Removable-drive connections and destination-file changes reported by employees who enabled monitoring.
                </p>
              </div>

              <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-xs leading-5 text-amber-100/80">
                Krypton records metadata only; it never reads or uploads file contents. A file-write event means a change was observed on the USB destination.
                Standard Windows user-mode notifications do not reliably provide the source path or confirm that a copy completed.
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-200">Device monitoring consent</h2>
                  <span className="text-[11px] text-slate-500">{usbMonitoredDevices.length} registered device(s)</span>
                </div>
                <p className="text-[11px] text-slate-500">Consent is recorded by the server; it does not prove that the local watcher is currently running. Activity rows represent events successfully received by Krypton.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {usbMonitoredDevices.map((device) => (
                    <div key={device.deviceId} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-[#0b1220] p-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{device.userName}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{device.userEmail || device.deviceName}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        device.consentAt && device.deviceStatus === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {device.consentAt && device.deviceStatus === 'active' ? 'Consent recorded' : 'Off'}
                      </span>
                    </div>
                  ))}
                  {usbMonitoredDevices.length === 0 && (
                    <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-5 text-sm text-slate-500">
                      No desktop devices are registered for this company.
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-[#0b1220] p-3 sm:flex-row sm:items-center">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    value={usbSearch}
                    onChange={(event) => setUsbSearch(event.target.value)}
                    aria-label="Search USB activity"
                    placeholder="Search employee, device, file, or destination…"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <select
                  value={usbEventFilter}
                  onChange={(event) => setUsbEventFilter(event.target.value)}
                  aria-label="Filter USB activity type"
                  className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-sky-400 focus:outline-none"
                >
                  <option value="">All USB events</option>
                  <option value="device_connected">Connected</option>
                  <option value="device_disconnected">Disconnected</option>
                  <option value="file_write_observed">File changes</option>
                </select>
                <span className="text-xs text-slate-500">{filteredUsbEvents.length} event(s)</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full min-w-[1100px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/80 font-semibold text-slate-400">
                    <tr>
                      <th className="p-4">Time</th>
                      <th className="p-4">Employee / device</th>
                      <th className="p-4">USB device</th>
                      <th className="p-4">Activity / file</th>
                      <th className="p-4">Source / destination</th>
                      <th className="p-4">Transfer status</th>
                      <th className="p-4">Alert</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsbEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-sm text-slate-500">
                          No USB activity matches these filters.
                        </td>
                      </tr>
                    ) : filteredUsbEvents.map((event) => (
                      <tr key={event.id} className="align-top text-slate-300 hover:bg-slate-800/30">
                        <td className="whitespace-nowrap p-4 text-[11px] text-slate-500">{new Date(event.timestamp).toLocaleString()}</td>
                        <td className="p-4">
                          <div className="font-medium text-white">{event.userName}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{event.userEmail}</div>
                          <div className="mt-1 text-[10px] text-slate-600">{event.deviceName} · Windows user {event.windowsUser || 'unknown'}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-slate-200">{event.driveLetter} {event.volumeLabel || 'Removable drive'}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{event.deviceModel || 'Device model unavailable'}</div>
                          {event.deviceSerial && <div className="mt-0.5 font-mono text-[10px] text-slate-600">S/N {event.deviceSerial}</div>}
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-slate-200">
                            {event.eventType === 'device_connected' ? 'Device connected' :
                              event.eventType === 'device_disconnected' ? 'Device disconnected' : event.fileName}
                          </div>
                          {event.fileName && (
                            <>
                              <div className="mt-1 text-[11px] text-slate-500">{event.extension || 'No extension'} · {event.sizeBytes === null ? 'Size unavailable' : `${(event.sizeBytes / (1024 * 1024)).toFixed(2)} MB`}</div>
                            </>
                          )}
                        </td>
                        <td className="max-w-[260px] p-4">
                          <div className="text-[11px] text-slate-500">Source: unavailable</div>
                          <div className="mt-1 break-all font-mono text-[10px] text-slate-400">{event.destinationPath || '—'}</div>
                        </td>
                        <td className="p-4 text-slate-400">
                          {event.transferStatus === 'destination_write_observed' ? 'Destination write observed · completion unverified' :
                            event.transferStatus === 'connected' ? 'Connected' : 'Disconnected'}
                        </td>
                        <td className="p-4">
                          {event.suspicious
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200"><AlertTriangle className="h-3 w-3" />{event.alertReasons?.join(', ') || 'Review'}</span>
                            : <span className="text-slate-600">—</span>}
                          <div className={`mt-2 text-[10px] ${event.integrityStatus === 'verified' ? 'text-emerald-400' : 'text-rose-300'}`}>
                            {event.integrityStatus === 'verified' ? 'Integrity verified' : `Integrity ${event.integrityStatus || 'unavailable'}`}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-600">Showing the latest 100 events. Logs are append-only in the application and protected by a server-side HMAC hash chain.</p>
            </div>
          )}

        </main>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-[#0b1220] p-6 text-sm shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-semibold text-white">Invite a teammate</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                aria-label="Close invite dialog"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            {inviteMessage && (
              <div className={`rounded-lg border p-3 ${
                inviteMessage.startsWith('Error:')
                  ? 'border-red-900/70 bg-red-950/30 text-red-200'
                  : 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200'
              }`}>
                {inviteMessage}
              </div>
            )}

            <form onSubmit={handleInviteEmployee} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Full name</label>
                <input
                  type="text"
                  required
                  placeholder="Rahul Sharma"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Work email</label>
                <input
                  type="email"
                  required
                  placeholder="rahul@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">
                We’ll email them a secure link to join your workspace.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
                >
                  {inviteLoading ? 'Sending Invitation...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
