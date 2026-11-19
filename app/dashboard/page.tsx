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
  Award,
  Activity,
  TrendingUp,
  BarChart3,
  Search,
  Filter,
  Key,
  Upload,
  FileSpreadsheet,
  Copy,
  Check,
  Edit2,
  Info,
  ExternalLink,
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
  const [aiSafety, setAiSafety] = useState<any>(null);
  const [aiSafetySearch, setAiSafetySearch] = useState('');
  const [showAiStats, setShowAiStats] = useState(false);
  const [aiStatsDays, setAiStatsDays] = useState(30);
  const [aiStatsDepartment, setAiStatsDepartment] = useState('');
  const [aiStats, setAiStats] = useState<any>(null);
  const [aiStatsLoading, setAiStatsLoading] = useState(false);
  const [aiStatsError, setAiStatsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'ai-safety' | 'license' | 'devices' | 'android' | 'incidents' | 'usb'>('overview');
  const [policySaveError, setPolicySaveError] = useState<string | null>(null);

  // Filter state for incidents
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [seatFilter, setSeatFilter] = useState<'all' | 'licensed' | 'unassigned'>('all');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [usbSearch, setUsbSearch] = useState('');
  const [usbEventFilter, setUsbEventFilter] = useState('');

  // License state
  const [copiedLicense, setCopiedLicense] = useState(false);

  // Excel / CSV Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Single Add / Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteDept, setInviteDept] = useState('');
  const [inviteDesignation, setInviteDesignation] = useState('');
  const [inviteSystemId, setInviteSystemId] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  // Edit Employee Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [seatAssignmentEmployee, setSeatAssignmentEmployee] = useState<any>(null);
  const [seatAssignmentPassword, setSeatAssignmentPassword] = useState('');
  const [seatAssignmentPasswordConfirm, setSeatAssignmentPasswordConfirm] = useState('');
  const [seatAssignmentError, setSeatAssignmentError] = useState<string | null>(null);
  const [seatAssignmentLoading, setSeatAssignmentLoading] = useState(false);

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

  useEffect(() => {
    if (!showAiStats) return;
    const token = localStorage.getItem('krypton_token');
    if (!token) {
      setAiStatsError('Your session expired. Sign in again to view statistics.');
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ days: String(aiStatsDays) });
    if (aiStatsDepartment) query.set('department', aiStatsDepartment);
    setAiStatsLoading(true);
    setAiStatsError(null);
    fetch(`/api/company/ai-safety?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load AI safety statistics.');
        return data;
      })
      .then((data) => setAiStats(data))
      .catch((error) => {
        if (error.name !== 'AbortError') setAiStatsError(error.message || 'Could not load AI safety statistics.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAiStatsLoading(false);
      });

    return () => controller.abort();
  }, [showAiStats, aiStatsDays, aiStatsDepartment]);

  const fetchCompanyData = async (token: string) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [resOverview, resEmp, resDev, resPol, resEvt, resAna, resUsb, resAiSafety] = await Promise.all([
        fetch('/api/company/overview', { headers }),
        fetch('/api/company/employees', { headers }),
        fetch('/api/company/devices', { headers }),
        fetch('/api/company/policy', { headers }),
        fetch('/api/company/events', { headers }),
        fetch('/api/company/analytics', { headers }),
        fetch('/api/company/usb-events', { headers }),
        fetch('/api/company/ai-safety', { headers }),
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
      if (resAiSafety.ok) setAiSafety(await resAiSafety.json());
    } catch (err) {
      console.error('Failed to load company data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLicense = (key?: string) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedLicense(true);
    setTimeout(() => setCopiedLicense(false), 2000);
  };

  const downloadSampleEmployeeTemplate = () => {
    const sampleRows = [
      {
        'Name': 'Rahul Sharma',
        'Email': 'rahul.sharma@company.com',
        'Contact Number': '9876543210',
        'Department': 'IT',
        'Designation': 'Software Developer',
        'System ID': 'SYS-001',
      },
      {
        'Name': 'Priya Verma',
        'Email': 'priya.verma@company.com',
        'Contact Number': '9876543211',
        'Department': 'HR',
        'Designation': 'HR Executive',
        'System ID': 'SYS-002',
      },
      {
        'Name': 'Aman Gupta',
        'Email': 'aman.gupta@company.com',
        'Contact Number': '9876543212',
        'Department': 'Finance',
        'Designation': 'Financial Analyst',
        'System ID': 'SYS-003',
      },
      {
        'Name': 'Neha Singh',
        'Email': 'neha.singh@company.com',
        'Contact Number': '9876543213',
        'Department': 'Sales',
        'Designation': 'Sales Manager',
        'System ID': 'SYS-004',
      },
      {
        'Name': 'Arjun Mehta',
        'Email': 'arjun.mehta@company.com',
        'Contact Number': '9876543214',
        'Department': 'IT',
        'Designation': 'System Administrator',
        'System ID': 'SYS-005',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 16 },
      { wch: 14 },
      { wch: 24 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employee Data');
    XLSX.writeFile(workbook, 'krypton_employee_data_template.xlsx');
  };

  const exportEmployeesToExcel = () => {
    if (employees.length === 0) {
      alert('No employee data available to export.');
      return;
    }
    const exportData = employees.map((emp) => ({
      'Name': emp.name || '',
      'Email': emp.email || '',
      'Contact Number': emp.phone || '',
      'Department': emp.department || '',
      'Designation': emp.designation || '',
      'System ID': emp.systemId || '',
      'Sign-in Access': emp.hasSeat ? 'Enabled' : 'Disabled',
      'Active Devices': emp.deviceCount || 0,
      'Account Status': emp.isActive ? 'Active' : 'Deactivated',
      'Joined Date': emp.joinedAt ? new Date(emp.joinedAt).toLocaleDateString() : '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
    XLSX.writeFile(workbook, `krypton_employee_directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExcelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          alert('The uploaded spreadsheet contains no data rows.');
          return;
        }

        const mapped = rawJson.map((row, idx) => {
          const name = String(row['Name'] || row['name'] || row['Full Name'] || row['Employee Name'] || '').trim();
          const email = String(row['Email'] || row['email'] || row['Email Address'] || '').trim().toLowerCase();
          const phone = String(row['Contact Number'] || row['contactNumber'] || row['Contact'] || row['Phone'] || row['Mobile'] || '').trim();
          const department = String(row['Department'] || row['department'] || row['Dept'] || '').trim();
          const designation = String(row['Designation'] || row['designation'] || row['Role'] || row['Title'] || '').trim();
          const systemId = String(row['System ID'] || row['systemId'] || row['SystemId'] || row['Emp ID'] || '').trim();
          const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

          return {
            rowNum: idx + 1,
            name: name || (email ? email.split('@')[0] : `Employee ${idx + 1}`),
            email,
            phone,
            department,
            designation,
            systemId,
            isValid: isValidEmail,
          };
        });

        const rowsByEmail = new Map<string, typeof mapped[number]>();
        for (const row of mapped) {
          if (!row.isValid) continue;
          rowsByEmail.set(row.email, row);
        }
        const uniqueRows = [
          ...Array.from(rowsByEmail.values()),
          ...mapped.filter((row) => !row.isValid),
        ].sort((a, b) => a.rowNum - b.rowNum);

        setImportPreviewRows(uniqueRows);
        setImportMessage(null);
        setShowImportModal(true);
      } catch (err: any) {
        alert('Could not parse Excel/CSV file: ' + (err.message || 'Invalid format'));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExecuteImport = async () => {
    if (importPreviewRows.length === 0) return;
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    const validRows = importPreviewRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setImportMessage({ type: 'error', text: 'No valid rows found to import. Please check email addresses.' });
      return;
    }

    setIsImporting(true);
    setImportMessage(null);

    try {
      const res = await fetch('/api/company/employees/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employees: validRows.map((r) => ({
            name: r.name,
            email: r.email,
            phone: r.phone,
            department: r.department,
            designation: r.designation,
            systemId: r.systemId,
            assignLicense: false,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Bulk import failed');
      }

      setImportMessage({
        type: 'success',
        text: `Roster saved: ${data.summary?.created || 0} added, ${data.summary?.updated || 0} updated. Sign-in remains disabled until you enable selected employees in the directory.`,
      });

      fetchCompanyData(token);
      setTimeout(() => {
        setShowImportModal(false);
        setImportPreviewRows([]);
        setImportMessage(null);
      }, 2000);
    } catch (err: any) {
      setImportMessage({ type: 'error', text: err.message || 'Error executing import' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleSeat = async (userId: string, currentSeat: boolean) => {
    if (!currentSeat) {
      const employee = employees.find((item) => item.userId === userId);
      if (!employee) return;
      if (!employee.hasPasswordConfigured) {
        setSeatAssignmentEmployee(employee);
        setSeatAssignmentPassword('');
        setSeatAssignmentPasswordConfirm('');
        setSeatAssignmentError(null);
        return;
      }
    }

    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/company/employees/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hasLicenseSeat: !currentSeat }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update employee sign-in access');
        return;
      }
      fetchCompanyData(token);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignSeatWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!seatAssignmentEmployee) return;
    if (seatAssignmentPassword.length < 12) {
      setSeatAssignmentError('Use a unique password with at least 12 characters.');
      return;
    }
    if (seatAssignmentPassword.toLowerCase() === seatAssignmentEmployee.email.toLowerCase()) {
      setSeatAssignmentError('The password cannot be the employee email address.');
      return;
    }
    if (seatAssignmentPassword !== seatAssignmentPasswordConfirm) {
      setSeatAssignmentError('The passwords do not match.');
      return;
    }

    const token = localStorage.getItem('krypton_token');
    if (!token) {
      setSeatAssignmentError('Please sign in again before enabling employee access.');
      return;
    }

    setSeatAssignmentLoading(true);
    setSeatAssignmentError(null);
    try {
      const response = await fetch(`/api/company/employees/${seatAssignmentEmployee.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(!seatAssignmentEmployee.hasPasswordConfigured && { hasLicenseSeat: true }),
          password: seatAssignmentPassword,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not enable employee sign-in.');
      setSeatAssignmentEmployee(null);
      setSeatAssignmentPassword('');
      setSeatAssignmentPasswordConfirm('');
      await fetchCompanyData(token);
    } catch (error) {
      setSeatAssignmentError(error instanceof Error ? error.message : 'Could not enable employee sign-in.');
    } finally {
      setSeatAssignmentLoading(false);
    }
  };

  const handleOpenEdit = (emp: any) => {
    setEditingEmployee({
      userId: emp.userId,
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || '',
      designation: emp.designation || '',
      systemId: emp.systemId || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    const token = localStorage.getItem('krypton_token');
    if (!token) return;

    setEditLoading(true);
    try {
      const res = await fetch(`/api/company/employees/${editingEmployee.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editingEmployee.name,
          phone: editingEmployee.phone,
          department: editingEmployee.department,
          designation: editingEmployee.designation,
          systemId: editingEmployee.systemId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Could not update employee details');
        return;
      }
      setShowEditModal(false);
      setEditingEmployee(null);
      fetchCompanyData(token);
    } catch (err) {
      console.error(err);
    } finally {
      setEditLoading(false);
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
          phone: invitePhone,
          department: inviteDept,
          designation: inviteDesignation,
          systemId: inviteSystemId,
          assignLicense: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');

      setInviteMessage(`Employee ${inviteName} added successfully!`);
      setInviteName('');
      setInviteEmail('');
      setInvitePhone('');
      setInviteDept('');
      setInviteDesignation('');
      setInviteSystemId('');
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
    if (!confirm('Remove this employee? Their sign-in will be disabled and paired devices revoked.')) {
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
    const headers = ['Timestamp', 'Employee', 'Email', 'Device', 'Target App', 'Input Type', 'File Count', 'File Types', 'Risk Level', 'Rule Code', 'Action', 'Redacted Snippet'];
    const rows = events.map((e) => [
      `"${e.timestamp}"`,
      `"${e.userName}"`,
      `"${e.userEmail}"`,
      `"${e.deviceName}"`,
      `"${e.targetApp}"`,
      `"${e.inputType || 'text'}"`,
      `"${e.fileCount || ''}"`,
      `"${(e.fileTypes || []).join('; ')}"`,
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

  const availableDepartments = Array.from(
    new Set(employees.map((e) => (e.department || '').trim()).filter(Boolean))
  ) as string[];
  const aiSafetyByUser = new Map<string, any>(
    (aiSafety?.employees || []).map((employee: any) => [String(employee.userId), employee] as [string, any]),
  );
  const filteredAiSafetyEmployees = (aiSafety?.employees || []).filter((employee: any) => {
    const term = aiSafetySearch.trim().toLowerCase();
    return !term || [employee.name, employee.email, employee.department]
      .some((value) => String(value || '').toLowerCase().includes(term));
  }).sort((left: any, right: any) =>
    (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER),
  );

  const filteredEmployees = employees.filter((emp) => {
    if (selectedDepartment && (emp.department || '').toLowerCase() !== selectedDepartment.toLowerCase()) {
      return false;
    }
    if (seatFilter === 'licensed' && !emp.hasSeat) return false;
    if (seatFilter === 'unassigned' && emp.hasSeat) return false;
    if (!teamSearch.trim()) return true;
    const term = teamSearch.toLowerCase().trim();
    return [emp.name, emp.email, emp.role, emp.phone, emp.department, emp.designation, emp.systemId]
      .some((value) => String(value || '').toLowerCase().includes(term));
  });
  const filteredDevices = devices.filter((dev) =>
    [dev.deviceName, dev.user?.name, dev.user?.email, dev.extension?.browser]
      .some((value) => String(value || '').toLowerCase().includes(deviceSearch.toLowerCase()))
  );
  const androidDevices = devices.filter((device) => device.platform === 'android');
  const displayedDevices = (activeTab === 'android'
    ? filteredDevices.filter((device) => device.platform === 'android')
    : filteredDevices);
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
  const aiStatsRiskLevels = [
    { key: 'LOW', label: 'Low risk', color: '#34d399' },
    { key: 'MEDIUM', label: 'Medium risk', color: '#38bdf8' },
    { key: 'HIGH', label: 'High risk', color: '#fbbf24' },
    { key: 'CRITICAL', label: 'Critical risk', color: '#fb7185' },
  ];
  const aiStatsRiskCounts = aiStatsRiskLevels.map((risk) => ({
    ...risk,
    count: aiStats?.charts?.riskDistribution?.[risk.key] || 0,
  }));
  const aiStatsRiskTotal = aiStatsRiskCounts.reduce((sum: number, risk) => sum + risk.count, 0);
  let aiStatsRiskOffset = 0;
  const aiStatsRiskGradient = aiStatsRiskTotal
    ? `conic-gradient(${aiStatsRiskCounts.map((risk) => {
        const start = aiStatsRiskOffset;
        aiStatsRiskOffset += (risk.count / aiStatsRiskTotal) * 100;
        return `${risk.color} ${start}% ${aiStatsRiskOffset}%`;
      }).join(', ')})`
    : 'conic-gradient(#334155 0% 100%)';
  const aiStatsDailyTrend = aiStats?.charts?.dailyTrend || [];
  const aiStatsMaxDaily = Math.max(1, ...aiStatsDailyTrend.map((day: any) => day.interactions));
  const aiStatsTeams = aiStats?.teams || [];
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
              { id: 'employees', label: 'Employee Directory', icon: Users },
              { id: 'ai-safety', label: 'AI safety scores', icon: Award },
              { id: 'license', label: 'Company License', icon: Key },
              { id: 'devices', label: 'Devices', icon: Laptop },
              { id: 'android', label: 'Android devices', icon: Laptop },
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

              {/* Company License Key Hero Banner */}
              <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-slate-900/60 to-indigo-950/40 p-5 sm:p-6 backdrop-blur">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
                        <Key className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Company License Key</span>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                        {license?.status || 'Active'}
                      </span>
                      <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300 border border-sky-500/30">
                        {license?.plan || 'Corporate'} Plan
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-white select-all">
                        {license?.licenseKey || 'No License Key Assigned'}
                      </div>
                      {license?.licenseKey && (
                        <button
                          onClick={() => handleCopyLicense(license.licenseKey)}
                          className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/25 active:scale-95"
                        >
                          {copiedLicense ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedLicense ? 'Copied to Clipboard!' : 'Copy Key'}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-400">
                      Employees use this license key along with their corporate email to activate desktop DLP and browser extension protection.
                    </p>
                  </div>

                  <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between border-t border-slate-800/80 pt-3 md:border-0 md:pt-0">
                    <button
                      onClick={() => setActiveTab('license')}
                      className="flex items-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-300"
                    >
                      <Key className="h-3.5 w-3.5" />
                      <span>Manage License & Activation</span>
                    </button>
                    {license?.expiresAt && (
                      <span className="mt-2 text-[11px] text-slate-500">
                        Renews / expires {new Date(license.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-sm font-medium text-slate-300">Device licenses in use</span>
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
                          <div className="truncate text-xs text-slate-400">
                            <span className="font-medium text-slate-300">{evt.ruleName}</span>
                            {evt.redactedPreview && !evt.redactedPreview.startsWith('[Prompt withheld') && !evt.redactedPreview.startsWith('[Preview withheld') && (
                              <span className="ml-1.5 font-mono text-sky-300/90">
                                · &ldquo;{evt.redactedPreview.length > 90 ? evt.redactedPreview.slice(0, 90) + '…' : evt.redactedPreview}&rdquo;
                              </span>
                            )}
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

          {/* TAB 2: EMPLOYEE DIRECTORY & DATA FEED */}
          {activeTab === 'employees' && (
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Hidden Excel / CSV input */}
              <input
                type="file"
                id="excel-file-input"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFileSelect}
                className="hidden"
              />

              {/* Header and Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
                    <Users className="w-6 h-6 text-sky-400" />
                    <span>Employee Directory</span>
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Import employee rosters via Excel, manage departments, designations, system IDs, and sign-in access.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => document.getElementById('excel-file-input')?.click()}
                    className="flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 px-3.5 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/25 active:scale-95"
                    title="Upload employee data via Excel (.xlsx) or CSV"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Excel / CSV</span>
                  </button>

                  <button
                    onClick={downloadSampleEmployeeTemplate}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                    title="Download Excel template matching standard format"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sample Template</span>
                  </button>

                  <button
                    onClick={exportEmployeesToExcel}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                    title="Export employee roster to Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export</span>
                  </button>

                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-sky-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-300 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Employee</span>
                  </button>


                </div>
              </div>

              {/* Filters & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-[#0b1220] p-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    placeholder="Search by name, email, department, designation, system ID..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Department Filter */}
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300 focus:border-sky-400 focus:outline-none"
                  >
                    <option value="">All Departments ({employees.length})</option>
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept} ({employees.filter((e) => (e.department || '').toLowerCase() === dept.toLowerCase()).length})
                      </option>
                    ))}
                  </select>

                  {/* Sign-in access filter */}
                  <select
                    value={seatFilter}
                    onChange={(e) => setSeatFilter(e.target.value as any)}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300 focus:border-sky-400 focus:outline-none"
                  >
                    <option value="all">All Employees ({employees.length})</option>
                    <option value="licensed">Sign-in Enabled ({employees.filter((e) => e.hasSeat).length})</option>
                    <option value="unassigned">Sign-in Disabled ({employees.filter((e) => !e.hasSeat).length})</option>
                  </select>

                  {(teamSearch || selectedDepartment || seatFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setTeamSearch('');
                        setSelectedDepartment('');
                        setSeatFilter('all');
                      }}
                      className="px-2.5 py-1.5 text-xs text-sky-400 hover:text-sky-300 transition"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {/* Employees Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Name</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Contact Number</th>
                      <th className="p-4">Department</th>
                      <th className="p-4">Designation</th>
                      <th className="p-4">System ID</th>
                      <th className="p-4">Password</th>
                      <th className="p-4">Sign-in Access</th>
                      <th className="p-4">AI Safety</th>
                      <th className="p-4">Devices</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-12 text-center text-sm text-slate-500">
                          <div className="max-w-md mx-auto space-y-3">
                            <Users className="w-8 h-8 mx-auto text-slate-600" />
                            <div className="font-semibold text-slate-300">No employees in workspace directory yet</div>
                            <p className="text-xs text-slate-500">
                              Upload an Excel (.xlsx / .xls) spreadsheet or invite individual employees to begin protecting workstations.
                            </p>
                            <div className="pt-2 flex justify-center gap-2">
                              <button
                                onClick={() => document.getElementById('excel-file-input')?.click()}
                                className="px-3.5 py-2 rounded-xl bg-sky-400 text-slate-950 font-semibold text-xs transition hover:bg-sky-300"
                              >
                                Upload Excel File
                              </button>
                              <button
                                onClick={downloadSampleEmployeeTemplate}
                                className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
                              >
                                Download Sample Template
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-10 text-center text-sm text-slate-500">
                          No team members match this search or filter.
                        </td>
                      </tr>
                    ) : filteredEmployees.map((emp) => {
                      const deptLower = (emp.department || '').toLowerCase();
                      const deptBadgeClass =
                        deptLower.includes('it') || deptLower.includes('tech') || deptLower.includes('eng')
                          ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                          : deptLower.includes('hr') || deptLower.includes('human')
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                          : deptLower.includes('finance') || deptLower.includes('acc')
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : deptLower.includes('sale') || deptLower.includes('market')
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700';

                      return (
                        <tr key={emp.membershipId || emp.userId} className="text-slate-300 hover:bg-slate-800/30 transition">
                          <td className="p-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 font-bold text-sky-300 text-[11px] border border-sky-500/20">
                                {emp.name ? emp.name.slice(0, 2).toUpperCase() : 'EM'}
                              </div>
                              <div>
                                <div className="font-semibold text-white">{emp.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono capitalize">{emp.role}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-slate-300 font-mono text-[11px]">
                            {emp.email}
                          </td>
                          <td className="p-4 text-slate-400 font-mono text-[11px]">
                            {emp.phone || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="p-4">
                            {emp.department ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${deptBadgeClass}`}>
                                {emp.department}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="p-4 text-slate-300">
                            {emp.designation || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="p-4">
                            {emp.systemId ? (
                              <span className="font-mono text-[11px] font-semibold text-slate-200 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                                {emp.systemId}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            {emp.role !== 'employee' ? (
                              <span className="text-[10px] font-medium text-slate-500">—</span>
                            ) : (
                              <div className="flex flex-col items-start gap-1">
                                <span className={`text-[10px] ${emp.hasPasswordConfigured ? 'text-emerald-400' : 'text-amber-300/80'}`}>
                                  {emp.hasPasswordConfigured ? 'Password set' : 'Not set'}
                                </span>
                                <button
                                  onClick={() => {
                                    setSeatAssignmentEmployee(emp);
                                    setSeatAssignmentPassword('');
                                    setSeatAssignmentPasswordConfirm('');
                                    setSeatAssignmentError(null);
                                  }}
                                  disabled={!emp.isActive}
                                  className="text-[10px] font-medium text-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {emp.hasPasswordConfigured ? 'Edit Password' : 'Set Password'}
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            {emp.role !== 'employee' ? (
                              <span className="text-[10px] font-medium text-slate-500">Administrator account</span>
                            ) : emp.hasSeat ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Sign-in enabled</span>
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleToggleSeat(emp.userId, true)}
                                    className="text-[10px] font-medium text-slate-500 hover:text-red-300"
                                    title="Disable employee sign-in and revoke their paired devices"
                                  >
                                    Disable access
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-start gap-1">
                                <button
                                  onClick={() => handleToggleSeat(emp.userId, false)}
                                  disabled={!emp.isActive}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[10px] font-medium border border-slate-700 hover:bg-sky-500/20 hover:text-sky-300 transition disabled:cursor-not-allowed disabled:opacity-40"
                                  title={!emp.isActive ? 'Activate this employee before enabling sign-in' : 'Enable sign-in and set the employee password'}
                                >
                                  <span>{emp.hasPasswordConfigured ? 'Enable sign-in' : 'Set password to enable sign-in'}</span>
                                </button>
                                <span className="text-[10px] text-amber-300/80">Access disabled · no sign-in</span>
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            {aiSafetyByUser.get(String(emp.userId))?.score != null ? (
                              <div>
                                <span className="font-semibold text-sky-200">
                                  {aiSafetyByUser.get(String(emp.userId)).score}
                                </span>
                                <span className="ml-1 text-[10px] text-slate-500">/ 100</span>
                                {aiSafetyByUser.get(String(emp.userId)).rank && (
                                  <div className="mt-1 text-[10px] text-slate-500">
                                    Rank #{aiSafetyByUser.get(String(emp.userId)).rank}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">Not rated yet</span>
                            )}
                          </td>
                          <td className="p-4 font-mono text-slate-300 text-[11px]">
                            {emp.deviceCount > 0 ? (
                              <span className="text-emerald-400 font-semibold">{emp.deviceCount} paired</span>
                            ) : (
                              <span className="text-slate-500">0 devices</span>
                            )}
                          </td>
                          <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenEdit(emp)}
                              className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded transition"
                              title="Edit details (Contact, Department, Designation, System ID)"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleEmployeeActive(emp.userId, emp.isActive)}
                              className={`px-2 py-1 rounded text-[10px] font-medium border transition ${
                                emp.isActive
                                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {emp.isActive ? 'Active' : 'Disabled'}
                            </button>
                            <button
                              onClick={() => handleRemoveEmployee(emp.userId)}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                              title="Remove employee and revoke their paired devices"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pending Invitations Table */}
              {pendingInvitations.length > 0 && (
                <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Pending invitations ({pendingInvitations.length})</h2>
                  <div className="divide-y divide-slate-800 text-xs">
                    {pendingInvitations.map((inv) => (
                      <div key={inv.id} className="py-2.5 flex items-center justify-between text-slate-400">
                        <div>
                          <span className="font-semibold text-white">{inv.name}</span> ({inv.email})
                        </div>
                        <span className="text-amber-400 text-[11px] font-medium">Pending Acceptance</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI SAFETY SCOREBOARD */}
          {activeTab === 'ai-safety' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-sky-300" />
                    <h1 className="text-2xl font-semibold tracking-tight text-white">AI safety scores</h1>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    Recognize safe, consistent AI use and responsible responses to guidance.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Rolling 30-day view</span>
                  <button
                    type="button"
                    onClick={() => setShowAiStats(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:border-sky-300/60 hover:bg-sky-400/15"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Stats
                  </button>
                </div>
              </div>

              {aiSafety?.coverageLimited && (
                <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-200">
                  This workspace has high activity volume. Scores use the latest 50,000 eligible events, so rankings may be incomplete.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Average safety score', value: aiSafety?.summary?.averageScore ?? '—', detail: 'Rated employees', icon: ShieldCheck },
                  { label: 'Employees rated', value: aiSafety?.summary?.ratedEmployees ?? 0, detail: 'With recorded AI activity', icon: Users },
                  { label: 'Safe AI interactions', value: aiSafety?.summary?.safeInteractions ?? 0, detail: 'Sensitive-free submissions', icon: Activity },
                  { label: 'Warnings resolved', value: aiSafety?.summary?.warningRecoveries ?? 0, detail: 'Stopped, then safely revised', icon: TrendingUp },
                ].map(({ label, value, detail, icon: Icon }) => (
                  <div key={label} className="rounded-xl border border-slate-800/80 bg-[#0b1220] p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">{label}</span>
                      <Icon className="h-4 w-4 text-sky-300" />
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{detail}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                  <div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-white">Employee leaderboard</h2>
                      <p className="mt-1 text-xs text-slate-500">Ranked only after a recorded interaction; inactive profiles are not scored.</p>
                    </div>
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="search"
                        aria-label="Search AI safety leaderboard"
                        value={aiSafetySearch}
                        onChange={(event) => setAiSafetySearch(event.target.value)}
                        placeholder="Search name or team"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/60 text-slate-500">
                        <tr>
                          <th className="px-5 py-3 font-medium">Rank</th>
                          <th className="px-5 py-3 font-medium">Employee</th>
                          <th className="px-5 py-3 font-medium">Score</th>
                          <th className="px-5 py-3 font-medium">Safe interactions</th>
                          <th className="px-5 py-3 font-medium">Warnings</th>
                          <th className="px-5 py-3 font-medium">AI interactions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredAiSafetyEmployees.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-10 text-center text-slate-500">
                              {aiSafetySearch ? 'No employees match this search.' : 'No eligible employee activity recorded in the last 30 days.'}
                            </td>
                          </tr>
                        ) : filteredAiSafetyEmployees.map((employee: any) => (
                          <tr key={employee.userId} className="text-slate-300 transition hover:bg-slate-800/30">
                            <td className="px-5 py-3.5 font-mono text-slate-500">
                              {employee.rank ? `#${employee.rank}` : '—'}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-white">{employee.name}</div>
                              <div className="mt-0.5 text-[10px] text-slate-500">{employee.department} · {employee.email}</div>
                            </td>
                            <td className="px-5 py-3.5">
                              {employee.score === null ? (
                                <span className="text-slate-500">Not rated</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold ${
                                    employee.score >= 85 ? 'text-emerald-300' : employee.score >= 70 ? 'text-sky-300' : 'text-amber-300'
                                  }`}>{employee.score}</span>
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${employee.score}%` }} />
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <div>{employee.safeInteractions}</div>
                              <div className="mt-0.5 text-[10px] text-slate-500">{employee.warningRecoveries} revised after warning</div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div>{employee.warnings}</div>
                              {employee.ignoredWarnings > 0 && (
                                <div className="mt-0.5 text-[10px] text-amber-300">{employee.ignoredWarnings} proceeded</div>
                              )}
                              {employee.highRiskAttempts > 0 && (
                                <div className="mt-0.5 text-[10px] text-rose-300">{employee.highRiskAttempts} high-risk attempts</div>
                              )}
                            </td>
                            <td className="px-5 py-3.5">{employee.interactions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-5">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-sky-300" />
                    <h2 className="text-sm font-semibold text-white">Team leaderboard</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Average score across rated team members.</p>
                  <div className="mt-5 space-y-4">
                    {(aiSafety?.teams || []).length === 0 ? (
                      <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs leading-5 text-slate-500">
                        Team rankings will appear after eligible AI activity is recorded.
                      </p>
                    ) : (aiSafety.teams as any[]).map((team) => (
                      <div key={team.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="mr-2 font-mono text-[10px] text-slate-500">#{team.rank}</span>
                            <span className="text-xs font-medium text-slate-200">{team.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-sky-200">{team.score}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-300" style={{ width: `${team.score}%` }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                          <span>{team.members} rated {team.members === 1 ? 'employee' : 'employees'}</span>
                          <span>{team.safeInteractions} safe interactions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-sky-500/15 bg-sky-500/[0.03] p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                  <div>
                    <h2 className="text-xs font-semibold text-slate-200">How the score works</h2>
                    <p className="mt-1.5 max-w-4xl text-xs leading-5 text-slate-400">
                      Scores reward safe AI use and consistent activity, add credit when a dismissed warning is followed by a clean submission on the same device within 15 minutes, and deduct points for proceeding after warnings or attempting highly sensitive data submissions. Counts cover supported Krypton browser integrations only, not every AI app or unprotected browser. Employees with no recorded activity are not ranked. This is a coaching indicator, not a performance or access-control decision. Only event metadata is used for scoring; clean prompt text is not collected. Redacted preview storage remains controlled by your Activity privacy setting.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB: COMPANY LICENSE & WORKSTATION ACTIVATION */}
          {activeTab === 'license' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
                  <Key className="w-6 h-6 text-sky-400" />
                  <span>Company License & Workstation Activation</span>
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Manage your organization&apos;s master license key and paired-device license usage. Each pair of active devices for one employee uses one license; employees with no paired devices use none.
                </p>
              </div>

              {/* Master License Key Box */}
              <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/40 via-slate-900/80 to-[#0b1220] p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Master License Key</span>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                        {license?.status || 'Active'}
                      </span>
                      <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300 border border-sky-500/30">
                        {license?.plan || 'Corporate'} Plan
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider text-white select-all bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl">
                        {license?.licenseKey || 'No License Key Assigned'}
                      </div>
                      {license?.licenseKey && (
                        <button
                          onClick={() => handleCopyLicense(license.licenseKey)}
                          className="flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/30 active:scale-95 shadow-sm"
                        >
                          {copiedLicense ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                          <span>{copiedLicense ? 'Copied License Key!' : 'Copy License Key'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:text-right text-xs">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-slate-500">Devices per license</div>
                        <div className="mt-1 text-base font-bold text-white font-mono">2 paired devices</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-slate-500">Offline Grace Period</div>
                      <div className="mt-1 text-base font-bold text-white font-mono">{license?.offlineGraceHours || 72} hours</div>
                    </div>
                  </div>
                </div>

                {/* Quota Progress Bar */}
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">
                      Device license quota: <span className="text-white font-bold">{license?.occupiedSeats || 0}</span> used of{' '}
                      <span className="text-white font-bold">{license?.seatLimit || 0}</span> licenses
                    </span>
                    <span className="font-semibold text-sky-300">
                      {license?.availableSeats || 0} available remaining
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, ((license?.occupiedSeats || 0) / (license?.seatLimit || 1)) * 100)}%`,
                      }}
                    />
                  </div>

                  {license?.expiresAt && (
                    <div className="text-[11px] text-slate-500">
                      License expiration / renewal date: <span className="text-slate-300 font-medium">{new Date(license.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Activation Instructions Card */}
              <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-6 space-y-4">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Info className="w-4 h-4 text-sky-400" />
                  <span>How Employees Activate Workstations</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-1.5">
                    <div className="font-bold text-sky-400 text-sm">Step 1</div>
                    <div className="font-semibold text-white">Download Agent</div>
                    <p className="text-slate-400 text-[11px]">
                      Employee downloads Windows Desktop Agent or installs Chrome Extension.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-1.5">
                    <div className="font-bold text-sky-400 text-sm">Step 2</div>
                    <div className="font-semibold text-white">Enter License Key</div>
                    <p className="text-slate-400 text-[11px]">
                      Enter Company License Key <span className="font-mono text-sky-300">{license?.licenseKey || 'KEY'}</span> on the pairing prompt.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-1.5">
                    <div className="font-bold text-sky-400 text-sm">Step 3</div>
                    <div className="font-semibold text-white">Verify Corporate Email</div>
                    <p className="text-slate-400 text-[11px]">
                      Employee enters their assigned corporate email from the Employee Directory.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-1.5">
                    <div className="font-bold text-emerald-400 text-sm">Step 4</div>
                    <div className="font-semibold text-white">Instant Protection</div>
                    <p className="text-slate-400 text-[11px]">
                      The workstation pairs securely. Real-time prompt DLP policies and secret scanning start protecting immediately.
                    </p>
                  </div>
                </div>
              </div>

              {/* Employees with sign-in enabled */}
              <div className="rounded-2xl border border-slate-800/80 bg-[#0b1220] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Enabled Team Members ({employees.filter((e) => e.hasSeat).length})</h2>
                    <p className="text-xs text-slate-400">Sign-in access is enabled. Device license usage is based on active paired devices.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('employees')}
                    className="text-xs text-sky-400 hover:text-sky-300 transition"
                  >
                    Go to Employee Directory &rarr;
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="pb-3">Name</th>
                        <th className="pb-3">Email</th>
                        <th className="pb-3">Department</th>
                        <th className="pb-3">System ID</th>
                        <th className="pb-3">Active Devices</th>
                        <th className="pb-3 text-right">Access Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {employees.filter((e) => e.hasSeat).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No employees have sign-in access yet.
                          </td>
                        </tr>
                      ) : (
                        employees.filter((e) => e.hasSeat).map((emp) => (
                          <tr key={emp.userId} className="text-slate-300 hover:bg-slate-800/30">
                            <td className="py-3 font-semibold text-white">{emp.name}</td>
                            <td className="py-3 font-mono text-[11px] text-slate-300">{emp.email}</td>
                            <td className="py-3">{emp.department || '—'}</td>
                            <td className="py-3 font-mono text-[11px]">{emp.systemId || '—'}</td>
                            <td className="py-3 font-mono text-emerald-400">{emp.deviceCount} paired</td>
                            <td className="py-3 text-right">
                              <button
                                onClick={() => handleToggleSeat(emp.userId, true)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-500/10 text-slate-300 hover:text-red-400 text-[11px] border border-slate-700 transition"
                              >
                                Disable Access
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEVICES */}
          {(activeTab === 'devices' || activeTab === 'android') && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  {activeTab === 'android' ? 'Android devices' : 'Devices'}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  {activeTab === 'android'
                    ? 'Android text checks are opt-in and run locally on each phone. This app does not enroll phones or report detections to this dashboard.'
                    : 'See connected devices and manage access.'}
                </p>
              </div>

              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={deviceSearch} onChange={(e) => setDeviceSearch(e.target.value)} placeholder="Search device or user" className="w-full rounded-xl border border-slate-800 bg-[#0b1220] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none" />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b1220]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                    <tr>
                      <th className="p-4">Device Name</th>
                      <th className="p-4">Assigned User</th>
                      <th className="p-4">{activeTab === 'android' ? 'Android app' : 'Protection'}</th>
                      <th className="p-4">Last active</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(activeTab === 'android' ? androidDevices.length : devices.length) === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-sm text-slate-500">
                          {activeTab === 'android' ? 'No Android devices have enrolled yet.' : 'No devices have connected yet.'}
                        </td>
                      </tr>
                    ) : displayedDevices.length === 0 ? (
                      <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500">No devices match this search.</td></tr>
                    ) : displayedDevices.map((dev) => (
                      <tr key={dev.id} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="p-4 font-bold text-white flex items-center space-x-2">
                          <Laptop className={`w-4 h-4 shrink-0 ${dev.platform === 'android' ? 'text-sky-400' : 'text-emerald-400'}`} />
                          <span>{dev.deviceName}</span>
                        </td>
                        <td className="p-4 text-slate-300">{dev.user?.name || dev.user?.email || 'N/A'}</td>
                        <td className="p-4 text-[11px]">
                          {dev.platform === 'android'
                            ? <span className="text-sky-200">Krypton Android {dev.appVersion || ''}</span>
                            : <>
                              <span className={dev.extension?.protectionActive ? 'text-emerald-300' : 'text-slate-500'}>
                                {dev.extension?.status || 'Not Installed'}
                              </span>
                              {dev.extension?.browser && (
                                <span className="ml-1 text-slate-500">
                                  ({dev.extension.browser === 'chrome' ? 'Chrome' : 'Edge'})
                                </span>
                              )}
                            </>}
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
                    Prompt and locally scanned file-submission attempts reported by connected browsers and devices.
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
                        <td className="p-4 text-slate-400">
                          <div>{evt.targetApp}</div>
                          {evt.inputType === 'file' && (
                            <div className="mt-1 text-[10px] text-sky-300">
                              File upload · {evt.fileCount} {evt.fileCount === 1 ? 'file' : 'files'}
                              {evt.fileTypes?.length ? ` · ${evt.fileTypes.join(', ').toUpperCase()}` : ''}
                            </div>
                          )}
                        </td>
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
                          {evt.redactedPreview && !evt.redactedPreview.startsWith('[Prompt withheld') && !evt.redactedPreview.startsWith('[Preview withheld') ? (
                            <div className="space-y-1">
                              <div className="rounded border border-slate-800 bg-slate-950/80 p-2 text-slate-200 select-text line-clamp-3 whitespace-pre-wrap break-words">
                                {evt.redactedPreview}
                              </div>
                              {evt.redactedPreview.length > 120 && (
                                <details className="text-[10px]">
                                  <summary className="cursor-pointer text-sky-400 hover:text-sky-300">Expand full prompt</summary>
                                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950 p-2 text-slate-200">
                                    {evt.redactedPreview}
                                  </pre>
                                </details>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">{evt.redactedPreview || 'No prompt preview recorded'}</span>
                          )}
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

      {showAiStats && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAiStats(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-safety-stats-title"
            className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#080f1c] shadow-2xl"
          >
            <header className="flex flex-col gap-4 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-sky-300" />
                  <h2 id="ai-safety-stats-title" className="text-lg font-semibold text-white">AI safety analytics</h2>
                </div>
                <p className="mt-1 text-xs text-slate-400">Filter the reporting window and team to explore interaction patterns.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="ai-stats-period">Reporting period</label>
                <select
                  id="ai-stats-period"
                  value={aiStatsDays}
                  onChange={(event) => setAiStatsDays(Number(event.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-400"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <label className="sr-only" htmlFor="ai-stats-department">Team filter</label>
                <select
                  id="ai-stats-department"
                  value={aiStatsDepartment}
                  onChange={(event) => setAiStatsDepartment(event.target.value)}
                  className="max-w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-400"
                >
                  <option value="">All teams</option>
                  {availableDepartments.sort((left, right) => left.localeCompare(right)).map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAiStats(false)}
                  aria-label="Close AI safety statistics"
                  className="rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="overflow-y-auto p-5 sm:p-7">
              {aiStatsError ? (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {aiStatsError}
                </div>
              ) : aiStatsLoading && !aiStats ? (
                <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-400">
                  <RefreshCw className="h-4 w-4 animate-spin text-sky-300" />
                  Loading filtered statistics…
                </div>
              ) : (
                <div className="space-y-5">
                  {aiStats?.coverageLimited && (
                    <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
                      High event volume: charts reflect the latest 50,000 eligible events.
                    </p>
                  )}
                  {aiStatsLoading && (
                    <p aria-live="polite" className="text-right text-[11px] text-sky-300">Updating charts…</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: 'AI interactions', value: aiStats?.summary?.interactions ?? 0 },
                      { label: 'Average safety score', value: aiStats?.summary?.averageScore ?? '—' },
                      { label: 'Warnings resolved', value: aiStats?.summary?.warningRecoveries ?? 0 },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="text-xs text-slate-400">{stat.label}</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                    <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Daily interaction trends</h3>
                          <p className="mt-1 text-[11px] text-slate-500">Submissions grouped by outcome</p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
                          {[['allow', 'Allowed', '#34d399'], ['warn', 'Warned', '#fbbf24'], ['block', 'Blocked', '#fb7185']].map(([key, label, color]) => (
                            <span key={key} className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />{label}
                            </span>
                          ))}
                        </div>
                      </div>
                      {aiStatsDailyTrend.length ? (
                        <div className="mt-5 overflow-x-auto pb-2">
                          <div className="flex h-52 min-w-max items-end gap-1.5 border-b border-l border-slate-700 px-2">
                            {aiStatsDailyTrend.map((day: any, index: number) => {
                              const step = Math.max(1, Math.ceil(aiStatsDailyTrend.length / 10));
                              const visibleDate = index % step === 0 || index === aiStatsDailyTrend.length - 1;
                              return (
                                <div key={day.day} className="flex h-full w-4 flex-col items-center justify-end sm:w-5">
                                  <div
                                    title={`${day.day}: ${day.interactions} interactions · ${day.allow} allowed · ${day.warn} warned · ${day.block} blocked`}
                                    className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm bg-slate-800/70 transition-opacity hover:opacity-80"
                                    style={{ height: `${Math.max(2, (day.interactions / aiStatsMaxDaily) * 100)}%` }}
                                  >
                                    {[
                                      { key: 'allow', color: '#34d399' },
                                      { key: 'warn', color: '#fbbf24' },
                                      { key: 'block', color: '#fb7185' },
                                    ].map((segment) => (
                                      <span
                                        key={segment.key}
                                        style={{
                                          height: `${day.interactions ? (day[segment.key] / day.interactions) * 100 : 0}%`,
                                          backgroundColor: segment.color,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  {visibleDate && (
                                    <span className="mt-2 whitespace-nowrap text-[9px] text-slate-500">
                                      {new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-8 rounded-lg border border-dashed border-slate-700 p-8 text-center text-xs text-slate-500">
                          No interactions for the selected filters and period.
                        </p>
                      )}
                    </article>

                    <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
                      <h3 className="text-sm font-semibold text-white">Risk distribution</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Share of detected interaction risk levels</p>
                      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
                        <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: aiStatsRiskGradient }}>
                          <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-[#0b1220]">
                            <span className="text-2xl font-bold text-white">{aiStatsRiskTotal}</span>
                            <span className="text-[10px] text-slate-500">events</span>
                          </div>
                        </div>
                        <div className="w-full space-y-3">
                          {aiStatsRiskCounts.map((risk) => (
                            <div key={risk.key} className="flex items-center justify-between gap-3 text-xs">
                              <span className="inline-flex items-center gap-2 text-slate-300">
                                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: risk.color }} />
                                {risk.label}
                              </span>
                              <span className="font-mono text-slate-400">
                                {risk.count} · {aiStatsRiskTotal ? Math.round((risk.count / aiStatsRiskTotal) * 100) : 0}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  </div>

                  <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-white">Team safety score</h3>
                    <p className="mt-1 text-[11px] text-slate-500">Average score among employees with recorded AI activity</p>
                    {aiStatsTeams.length ? (
                      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                        {aiStatsTeams.map((team: any) => (
                          <div key={team.name}>
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                              <span className="truncate pr-3 text-slate-300">{team.name}</span>
                              <span className="font-semibold text-sky-200">{team.score}/100</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-300" style={{ width: `${team.score}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-slate-500">No rated teams for the selected filters.</p>
                    )}
                  </article>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Excel / CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  <span>Import Employee Data</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review the parsed employee rows before importing into the company workspace.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportPreviewRows([]);
                  setImportMessage(null);
                }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {importMessage && (
              <div className={`rounded-xl border p-3 text-xs font-medium ${
                importMessage.type === 'error'
                  ? 'border-red-900/70 bg-red-950/40 text-red-200'
                  : 'border-emerald-900/70 bg-emerald-950/40 text-emerald-200'
              }`}>
                {importMessage.text}
              </div>
            )}

            {/* Preview Table */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800/80 bg-slate-950/70">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0d1527] border-b border-slate-800 text-slate-400 font-semibold">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Contact Number</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Designation</th>
                    <th className="p-3">System ID</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {importPreviewRows.map((row) => (
                    <tr key={row.rowNum} className={row.isValid ? 'hover:bg-slate-800/30' : 'bg-red-950/20 text-red-200'}>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">{row.rowNum}</td>
                      <td className="p-3 font-semibold text-white">{row.name}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-300">{row.email}</td>
                      <td className="p-3 font-mono text-slate-400">{row.phone || '—'}</td>
                      <td className="p-3">{row.department || '—'}</td>
                      <td className="p-3">{row.designation || '—'}</td>
                      <td className="p-3 font-mono text-slate-300">{row.systemId || '—'}</td>
                      <td className="p-3 text-right">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 font-semibold text-[10px]">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Invalid Email</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import summary */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-slate-800">
              <p className="max-w-xl text-xs leading-5 text-slate-400">
                Import adds roster records only. Enable sign-in for selected employees in the Employee Directory and set their passwords there.
              </p>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportPreviewRows([]);
                  }}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={isImporting || importPreviewRows.filter((r) => r.isValid).length === 0}
                  className="rounded-xl bg-sky-400 px-5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50 flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <span>
                      Confirm & Import ({importPreviewRows.filter((r) => r.isValid).length} Rows)
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-400" />
                <span>Edit Employee Details</span>
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEmployee(null);
                }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-300">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={editingEmployee.email}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-xs text-slate-500 cursor-not-allowed font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-300">Contact Number</label>
                  <input
                    type="text"
                    placeholder="9876543210"
                    value={editingEmployee.phone}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-medium text-slate-300">Department</label>
                  <input
                    type="text"
                    placeholder="IT / HR / Finance / Sales"
                    value={editingEmployee.department}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-300">Designation</label>
                  <input
                    type="text"
                    placeholder="Software Developer"
                    value={editingEmployee.designation}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, designation: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-medium text-slate-300">System ID</label>
                  <input
                    type="text"
                    placeholder="SYS-001"
                    value={editingEmployee.systemId}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, systemId: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingEmployee(null);
                  }}
                  className="rounded-xl px-4 py-2 font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set or edit employee password */}
      {seatAssignmentEmployee && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-sky-500/20 bg-[#0b1220] p-6 shadow-2xl shadow-sky-950/30">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-white">
                  <Key className="h-4 w-4 text-sky-400" />
                  {seatAssignmentEmployee.hasPasswordConfigured ? 'Edit employee password' : 'Set employee password'}
                </h2>
                <p className="mt-2 text-xs text-slate-400">
                  {seatAssignmentEmployee.hasPasswordConfigured ? 'Choose a new password for ' : 'Set a password for '}
                  <span className="font-mono text-sky-300">{seatAssignmentEmployee.email}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSeatAssignmentEmployee(null)}
                aria-label="Close employee access dialog"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAssignSeatWithPassword} className="space-y-4">
              <div>
                <label htmlFor="seat-password" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Set employee password
                </label>
                <input
                  id="seat-password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={seatAssignmentPassword}
                  onChange={(event) => setSeatAssignmentPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-400"
                  placeholder="At least 12 characters"
                />
              </div>
              <div>
                <label htmlFor="seat-password-confirm" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Confirm password
                </label>
                <input
                  id="seat-password-confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={seatAssignmentPasswordConfirm}
                  onChange={(event) => setSeatAssignmentPasswordConfirm(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-400"
                  placeholder="Re-enter the password"
                />
              </div>
              <p className="text-[11px] leading-5 text-slate-400">
                Use a unique password, not their email. Share it with the employee securely; it is not sent by email.
              {!seatAssignmentEmployee.hasPasswordConfigured && ' Setting this password will also enable sign-in.'}
              </p>
              {seatAssignmentError && (
                <p role="alert" className="rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-xs text-red-200">
                  {seatAssignmentError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setSeatAssignmentEmployee(null)}
                  disabled={seatAssignmentLoading}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={seatAssignmentLoading}
                  className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {seatAssignmentLoading
                    ? (seatAssignmentEmployee.hasPasswordConfigured ? 'Saving…' : 'Setting password…')
                    : (seatAssignmentEmployee.hasPasswordConfigured ? 'Save Password' : 'Set Password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Invite Employee Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0b1220] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                <span>Add New Employee</span>
              </h2>
              <button
                onClick={() => setShowInviteModal(false)}
                aria-label="Close invite dialog"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            {inviteMessage && (
              <div className={`rounded-xl border p-3 text-xs font-medium ${
                inviteMessage.startsWith('Error:')
                  ? 'border-red-900/70 bg-red-950/30 text-red-200'
                  : 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200'
              }`}>
                {inviteMessage}
              </div>
            )}

            <form onSubmit={handleInviteEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-300">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Rahul Sharma"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-medium text-slate-300">Work Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="rahul@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-300">Contact Number</label>
                  <input
                    type="text"
                    placeholder="9876543210"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-medium text-slate-300">Department</label>
                  <input
                    type="text"
                    placeholder="IT, HR, Finance, Sales"
                    value={inviteDept}
                    onChange={(e) => setInviteDept(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-medium text-slate-300">Designation</label>
                  <input
                    type="text"
                    placeholder="Software Developer"
                    value={inviteDesignation}
                    onChange={(e) => setInviteDesignation(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-medium text-slate-300">System ID</label>
                  <input
                    type="text"
                    placeholder="SYS-001"
                    value={inviteSystemId}
                    onChange={(e) => setInviteSystemId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-sky-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <p className="text-[11px] leading-5 text-slate-400">
                Inviting an employee does not enable sign-in. After they join, enable access from the directory and set their sign-in password.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl px-4 py-2 font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
                >
                  {inviteLoading ? 'Adding...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
