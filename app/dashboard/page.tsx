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
  Key,
  Sliders,
  FileText,
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
  const [analytics, setAnalytics] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'devices' | 'policy' | 'incidents' | 'audit'>('overview');

  // Filter state for incidents
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  // Custom Rule Form
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

      const [resOverview, resEmp, resDev, resPol, resEvt, resAna, resLogs] = await Promise.all([
        fetch('/api/company/overview', { headers }),
        fetch('/api/company/employees', { headers }),
        fetch('/api/company/devices', { headers }),
        fetch('/api/company/policy', { headers }),
        fetch('/api/company/events', { headers }),
        fetch('/api/company/analytics', { headers }),
        fetch('/api/company/audit-logs', { headers }),
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
      if (resLogs.ok) {
        const d = await resLogs.json();
        setAuditLogs(d.logs || []);
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

  const handleTogglePolicy = async (field: string, currentVal: boolean) => {
    const token = localStorage.getItem('krypton_token');
    if (!token || !policy) return;

    const updated = { ...policy, [field]: !currentVal };
    setPolicy(updated);

    try {
      await fetch('/api/company/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: !currentVal }),
      });
    } catch (e) {
      console.error(e);
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
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        e.userEmail.toLowerCase().includes(term) ||
        e.ruleCode.toLowerCase().includes(term) ||
        e.ruleName.toLowerCase().includes(term) ||
        e.deviceName.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-white">{company?.name || 'Company Workspace'}</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                {company?.plan || 'Business'} Plan
              </span>
            </div>
            <p className="text-[11px] text-slate-400">AI Data Governance & Seat Management Portal</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Link
            href="/download"
            className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Windows Installer</span>
          </Link>
          <div className="text-right text-xs">
            <div className="font-semibold text-slate-200">{company?.contactEmail}</div>
            <div className="text-slate-500 text-[10px]">Company Administrator</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
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
            <Shield className="w-4 h-4" />
            <span>Workspace Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('employees')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'employees'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Employees & Seats ({employees.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'devices'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Registered Devices ({devices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('policy')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'policy'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Security Policies</span>
          </button>

          <button
            onClick={() => setActiveTab('incidents')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'incidents'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Security Incidents ({events.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'audit'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail</span>
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="max-w-6xl space-y-8">
              <div>
                <h1 className="text-xl font-bold text-white">Company Workspace Status</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Tenant-isolated overview of seat allocations, endpoint protections, and blocked prompt secrets.
                </p>
              </div>

              {/* Seat Metric Highlight */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Seat Allocation Utilization
                    </span>
                    <div className="text-3xl font-extrabold text-white mt-1">
                      {license?.occupiedSeats || 0}{' '}
                      <span className="text-base font-normal text-slate-400">
                        / {license?.seatLimit || 0} seats occupied
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Company License Key</div>
                      <div className="font-mono text-emerald-400 font-bold text-xs bg-slate-950 px-3 py-1.5 rounded border border-slate-800">
                        {license?.licenseKey || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, ((license?.occupiedSeats || 0) / (license?.seatLimit || 1)) * 100)}%`,
                    }}
                  />
                </div>

                <div className="flex justify-between text-xs text-slate-400 pt-1">
                  <span>Available Seats: {license?.availableSeats || 0}</span>
                  <span>Grace Period: {license?.offlineGraceHours || 72}h</span>
                  <span>Status: {license?.status || 'Active'}</span>
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Active Workstation Devices</div>
                  <div className="text-2xl font-extrabold text-white">{devices.length}</div>
                  <div className="text-[11px] text-emerald-400">Enforcing local secret inspection</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Blocked Prompts</div>
                  <div className="text-2xl font-extrabold text-white">{analytics?.actionCounts?.block || 0}</div>
                  <div className="text-[11px] text-red-400">Credentials prevented from leak</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
                  <div className="text-xs text-slate-400">Warnings Confirmed</div>
                  <div className="text-2xl font-extrabold text-white">{analytics?.actionCounts?.warn || 0}</div>
                  <div className="text-[11px] text-amber-400">Employee confirmation workflows</div>
                </div>
              </div>

              {/* Recent Security Incidents */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Recent Security Incidents</h3>
                  <button
                    onClick={() => setActiveTab('incidents')}
                    className="text-xs text-emerald-400 hover:underline font-semibold"
                  >
                    View All Incidents &rarr;
                  </button>
                </div>

                {events.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    No security incidents recorded yet. Prompts scanned by your team will appear here in real-time.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {events.slice(0, 4).map((evt) => (
                      <div
                        key={evt.id}
                        className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-1 max-w-xl">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                evt.actionTaken === 'block' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {evt.actionTaken}
                            </span>
                            <span className="font-mono text-emerald-400 font-bold">{evt.ruleCode}</span>
                            <span className="text-slate-300 font-semibold">{evt.userName}</span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 truncate">
                            {evt.redactedPreview}
                          </div>
                        </div>
                        <span className="text-slate-500 text-[11px]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEES */}
          {activeTab === 'employees' && (
            <div className="max-w-6xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white">Employees & Seat Assignments</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage team access. Deactivating an employee releases their seat atomically back to your company pool.
                  </p>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-3.5 py-2 rounded-lg text-xs flex items-center space-x-1.5 transition shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Invite Employee</span>
                </button>
              </div>

              {/* Employees Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
                    {employees.map((emp) => (
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
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-bold text-slate-300">Pending Email Invitations</h3>
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
            <div className="max-w-6xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-white">Registered Workstation Devices</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Krypton desktop devices and their browser-extension protection status. Revoking a device disables its linked extension sessions.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Device Name</th>
                      <th className="p-4">Assigned User</th>
                      <th className="p-4">Hardware ID</th>
                      <th className="p-4">Platform</th>
                      <th className="p-4">Browser Extension</th>
                      <th className="p-4">Last Heartbeat</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {devices.map((dev) => (
                      <tr key={dev.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="p-4 font-bold text-white flex items-center space-x-2">
                          <Laptop className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{dev.deviceName}</span>
                        </td>
                        <td className="p-4 text-slate-300">{dev.user?.name || dev.user?.email || 'N/A'}</td>
                        <td className="p-4 font-mono text-[11px] text-slate-500">{dev.deviceId}</td>
                        <td className="p-4 text-slate-400 text-[11px]">{dev.platform || dev.osVersion}</td>
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
                          {new Date(dev.lastHeartbeatAt).toLocaleString()}
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
          {activeTab === 'policy' && (
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
            <div className="max-w-6xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-white">Security Incident Audit</h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Redacted log of prompt interception events reported by Windows endpoints.
                  </p>
                </div>
                <button
                  onClick={handleExportCSV}
                  disabled={events.length === 0}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center space-x-1.5 border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export to CSV</span>
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by employee, rule code, device..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Risk Levels</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {/* Incidents Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Employee</th>
                      <th className="p-4">Workflow / Target</th>
                      <th className="p-4">Risk Level</th>
                      <th className="p-4">Rule Code</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Redacted Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredEvents.map((evt) => (
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
                        <td className="p-4 font-bold uppercase text-[10px] text-red-400">{evt.actionTaken}</td>
                        <td className="p-4 font-mono text-[11px] text-slate-300 max-w-xs truncate">
                          {evt.redactedPreview}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="max-w-6xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-white">Company Administrative Audit Trail</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Log of administrator actions, invitations, device revocations, and policy modifications.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Actor</th>
                      <th className="p-4">Entity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditLogs.map((log) => (
                      <tr key={log._id} className="text-slate-300">
                        <td className="p-4 text-slate-500 font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-400">{log.action}</td>
                        <td className="p-4 text-white">{log.actorEmail}</td>
                        <td className="p-4 text-slate-400">{log.entityType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Invite Employee to Workspace</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            {inviteMessage && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300">
                {inviteMessage}
              </div>
            )}

            <form onSubmit={handleInviteEmployee} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Employee Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Rahul Sharma"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Employee Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="rahul@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 text-[11px]">
                Upon invitation, the employee will receive an email containing the company license key and password setup link.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg"
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
