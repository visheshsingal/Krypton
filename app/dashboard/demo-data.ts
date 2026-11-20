function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function createDashboardDemoData() {
  const eventTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return {
      day: date.toISOString().slice(0, 10),
      action: 'allow',
      count: 110 + index * 13,
    };
  });
  const blockTrend = eventTrend.map((entry, index) => ({
    ...entry,
    action: 'block',
    count: 7 + index * 2,
  }));
  const warnTrend = eventTrend.map((entry, index) => ({
    ...entry,
    action: 'warn',
    count: 12 + index,
  }));

  const employees = [
    { userId: 'demo-employee-1', membershipId: 'demo-member-1', name: 'Aarav Mehta', email: 'aarav.mehta@northstar.example', phone: '+91 98765 10001', department: 'Engineering', designation: 'Engineering Lead', systemId: 'NS-ENG-001', role: 'employee', hasPasswordConfigured: true, hasSeat: true, isActive: true, deviceCount: 2, joinedAt: hoursAgo(24 * 180) },
    { userId: 'demo-employee-2', membershipId: 'demo-member-2', name: 'Diya Kapoor', email: 'diya.kapoor@northstar.example', phone: '+91 98765 10002', department: 'Finance', designation: 'Financial Analyst', systemId: 'NS-FIN-014', role: 'employee', hasPasswordConfigured: true, hasSeat: true, isActive: true, deviceCount: 1, joinedAt: hoursAgo(24 * 140) },
    { userId: 'demo-employee-3', membershipId: 'demo-member-3', name: 'Kabir Shah', email: 'kabir.shah@northstar.example', phone: '+91 98765 10003', department: 'Product', designation: 'Product Manager', systemId: 'NS-PRD-008', role: 'employee', hasPasswordConfigured: true, hasSeat: true, isActive: true, deviceCount: 1, joinedAt: hoursAgo(24 * 90) },
    { userId: 'demo-employee-4', membershipId: 'demo-member-4', name: 'Anaya Rao', email: 'anaya.rao@northstar.example', phone: '+91 98765 10004', department: 'Engineering', designation: 'Software Engineer', systemId: 'NS-ENG-022', role: 'employee', hasPasswordConfigured: true, hasSeat: true, isActive: true, deviceCount: 1, joinedAt: hoursAgo(24 * 60) },
    { userId: 'demo-employee-5', membershipId: 'demo-member-5', name: 'Reyansh Nair', email: 'reyansh.nair@northstar.example', phone: '+91 98765 10005', department: 'People', designation: 'People Operations', systemId: 'NS-PPL-005', role: 'employee', hasPasswordConfigured: false, hasSeat: false, isActive: true, deviceCount: 0, joinedAt: hoursAgo(24 * 30) },
    { userId: 'demo-employee-6', membershipId: 'demo-member-6', name: 'Myra Das', email: 'myra.das@northstar.example', phone: '+91 98765 10006', department: 'Sales', designation: 'Account Executive', systemId: 'NS-SAL-019', role: 'employee', hasPasswordConfigured: true, hasSeat: true, isActive: false, deviceCount: 0, joinedAt: hoursAgo(24 * 12) },
  ];

  const devices = [
    { id: 'demo-device-1', deviceId: 'demo-device-1', deviceName: 'NS-ENG-LAPTOP-01', platform: 'windows', status: 'active', appVersion: '1.0.1', user: { name: 'Aarav Mehta', email: employees[0].email }, ownership: 'company', schedule: { enabled: false, workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata' }, lastHeartbeatAt: hoursAgo(0.2), extension: { installed: true, protectionActive: true, status: 'Protected', browser: 'chrome' } },
    { id: 'demo-device-2', deviceId: 'demo-device-2', deviceName: 'NS-FIN-DESKTOP-03', platform: 'windows', status: 'active', appVersion: '1.0.1', user: { name: 'Diya Kapoor', email: employees[1].email }, ownership: 'company', schedule: { enabled: false, workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata' }, lastHeartbeatAt: hoursAgo(1.4), extension: { installed: true, protectionActive: true, status: 'Protected', browser: 'edge' } },
    { id: 'demo-device-3', deviceId: 'demo-device-3', deviceName: 'BYOD-KABIR-01', platform: 'windows', status: 'active', appVersion: '1.0.1', user: { name: 'Kabir Shah', email: employees[2].email }, ownership: 'personal', schedule: { enabled: true, workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata' }, lastHeartbeatAt: hoursAgo(2.1), extension: { installed: true, protectionActive: true, status: 'Protected', browser: 'chrome' } },
    { id: 'demo-device-4', deviceId: 'demo-device-4', deviceName: 'NS-ENG-LAPTOP-07', platform: 'windows', status: 'active', appVersion: '1.0.1', user: { name: 'Anaya Rao', email: employees[3].email }, ownership: 'company', schedule: { enabled: false, workDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata' }, lastHeartbeatAt: hoursAgo(5.5), extension: { installed: false, protectionActive: false, status: 'Not Installed' } },
    { id: 'demo-device-5', deviceId: 'demo-device-5', deviceName: 'NS-MOBILE-ANDROID-02', platform: 'android', status: 'active', appVersion: '0.2.1', user: { name: 'Aarav Mehta', email: employees[0].email }, ownership: 'company', schedule: { enabled: false }, lastHeartbeatAt: hoursAgo(0.8) },
  ];

  const events = [
    { id: 'demo-event-1', timestamp: hoursAgo(0.2), userId: employees[0].userId, userName: employees[0].name, userEmail: employees[0].email, deviceName: devices[0].deviceName, targetApp: 'ChatGPT · Chrome', inputType: 'text', riskLevel: 'CRITICAL', ruleCode: 'SECRET_API_KEY', ruleName: 'API key detected', actionTaken: 'block', redactedPreview: 'Review deployment config: [REDACTED: API KEY]' },
    { id: 'demo-event-2', timestamp: hoursAgo(1.1), userId: employees[1].userId, userName: employees[1].name, userEmail: employees[1].email, deviceName: devices[1].deviceName, targetApp: 'Claude · Edge', inputType: 'text', riskLevel: 'HIGH', ruleCode: 'PII_FINANCIAL', ruleName: 'Financial data detected', actionTaken: 'warn', redactedPreview: 'Summarize this report: [REDACTED: ACCOUNT NUMBER]' },
    { id: 'demo-event-3', timestamp: hoursAgo(2.4), userId: employees[2].userId, userName: employees[2].name, userEmail: employees[2].email, deviceName: devices[2].deviceName, targetApp: 'Gemini · Chrome', inputType: 'text', riskLevel: 'LOW', ruleCode: 'SAFE_PROMPT', ruleName: 'No sensitive data detected', actionTaken: 'allow', redactedPreview: 'Help me outline a product launch plan.' },
    { id: 'demo-event-4', timestamp: hoursAgo(4.2), userId: employees[3].userId, userName: employees[3].name, userEmail: employees[3].email, deviceName: devices[3].deviceName, targetApp: 'Copilot · Chrome', inputType: 'file', fileCount: 1, fileTypes: ['pdf'], riskLevel: 'MEDIUM', ruleCode: 'INTERNAL_DOC', ruleName: 'Internal document reviewed', actionTaken: 'warn', redactedPreview: '[Preview withheld by workspace privacy setting]' },
    { id: 'demo-event-5', timestamp: hoursAgo(7), userId: employees[0].userId, userName: employees[0].name, userEmail: employees[0].email, deviceName: devices[0].deviceName, targetApp: 'Perplexity · Chrome', inputType: 'text', riskLevel: 'LOW', ruleCode: 'SAFE_PROMPT', ruleName: 'No sensitive data detected', actionTaken: 'allow', redactedPreview: 'Compare common database indexing strategies.' },
    { id: 'demo-event-6', timestamp: hoursAgo(10), userId: employees[1].userId, userName: employees[1].name, userEmail: employees[1].email, deviceName: devices[1].deviceName, targetApp: 'ChatGPT · Edge', inputType: 'text', riskLevel: 'HIGH', ruleCode: 'CREDENTIAL_SECRET', ruleName: 'Credential detected', actionTaken: 'block', redactedPreview: 'Check this config: [REDACTED: PASSWORD]' },
  ];

  const aiEmployees = [
    { userId: employees[0].userId, name: employees[0].name, email: employees[0].email, department: employees[0].department, rank: 1, score: 96, safeInteractions: 128, warningRecoveries: 8, warnings: 4, ignoredWarnings: 0, highRiskAttempts: 1, interactions: 133 },
    { userId: employees[2].userId, name: employees[2].name, email: employees[2].email, department: employees[2].department, rank: 2, score: 91, safeInteractions: 92, warningRecoveries: 5, warnings: 6, ignoredWarnings: 1, highRiskAttempts: 0, interactions: 99 },
    { userId: employees[1].userId, name: employees[1].name, email: employees[1].email, department: employees[1].department, rank: 3, score: 84, safeInteractions: 76, warningRecoveries: 3, warnings: 9, ignoredWarnings: 2, highRiskAttempts: 2, interactions: 87 },
    { userId: employees[3].userId, name: employees[3].name, email: employees[3].email, department: employees[3].department, rank: 4, score: 78, safeInteractions: 51, warningRecoveries: 2, warnings: 7, ignoredWarnings: 1, highRiskAttempts: 1, interactions: 59 },
  ];

  return {
    companyData: {
      company: { id: 'demo-company', name: 'Northstar Technologies (Demo)', slug: 'northstar-demo', plan: 'Corporate', status: 'active', contactEmail: 'admin@northstar.example', createdAt: hoursAgo(24 * 365) },
      license: { id: 'demo-license', licenseKey: 'DEMO-NSTAR-2026-XXXX', plan: 'Corporate', seatLimit: 25, occupiedSeats: 4, availableSeats: 21, status: 'active', devicesPerLicenseSeat: 2, offlineGraceHours: 72, expiresAt: hoursAgo(-24 * 180) },
      stats: { totalEmployees: 6, activeDevices: 5, totalIncidents: 286, seatsUtilizationPercent: 16 },
    },
    employees,
    pendingInvitations: [
      { id: 'demo-invite-1', name: 'Ishaan Verma', email: 'ishaan.verma@northstar.example' },
      { id: 'demo-invite-2', name: 'Sara Iyer', email: 'sara.iyer@northstar.example' },
    ],
    devices,
    policy: {
      blockCriticalRisk: true,
      blockHighRisk: true,
      warnMediumRisk: true,
      redactedPromptLoggingEnabled: false,
      customRules: [
        { ruleCode: 'NORTHSTAR_INTERNAL', name: 'Northstar confidential terms', pattern: 'NORTHSTAR-PRIVATE', riskLevel: 'HIGH', isEnabled: true, isBuiltIn: false },
        { ruleCode: 'PROJECT_ORBIT', name: 'Project Orbit identifier', pattern: 'PROJECT-ORBIT', riskLevel: 'MEDIUM', isEnabled: true, isBuiltIn: false },
      ],
    },
    events,
    usbEvents: [
      { id: 'demo-usb-1', timestamp: hoursAgo(0.6), userName: employees[0].name, userEmail: employees[0].email, windowsUser: 'aarav.m', deviceName: devices[0].deviceName, deviceId: devices[0].deviceId, driveLetter: 'E:', volumeLabel: 'NSTAR-USB', deviceModel: 'Secure USB Drive', deviceSerial: 'DEMO-SN-1042', eventType: 'file_write_observed', fileName: 'Q4-forecast.xlsx', extension: '.xlsx', sizeBytes: 2_450_000, destinationPath: 'E:\\Finance\\Q4-forecast.xlsx', transferStatus: 'destination_write_observed', suspicious: true, alertReasons: ['Sensitive spreadsheet extension'], integrityStatus: 'verified' },
      { id: 'demo-usb-2', timestamp: hoursAgo(3.2), userName: employees[1].name, userEmail: employees[1].email, windowsUser: 'diya.k', deviceName: devices[1].deviceName, deviceId: devices[1].deviceId, driveLetter: 'F:', volumeLabel: 'BACKUP', deviceModel: 'USB SSD', deviceSerial: 'DEMO-SN-2081', eventType: 'device_connected', fileName: null, extension: null, sizeBytes: null, destinationPath: null, transferStatus: 'connected', suspicious: false, alertReasons: [], integrityStatus: 'verified' },
      { id: 'demo-usb-3', timestamp: hoursAgo(6), userName: employees[2].name, userEmail: employees[2].email, windowsUser: 'kabir.s', deviceName: devices[2].deviceName, deviceId: devices[2].deviceId, driveLetter: 'G:', volumeLabel: 'UNTITLED', deviceModel: 'Removable drive', deviceSerial: null, eventType: 'file_write_observed', fileName: 'readme.txt', extension: '.txt', sizeBytes: 4_096, destinationPath: 'G:\\readme.txt', transferStatus: 'destination_write_observed', suspicious: false, alertReasons: [], integrityStatus: 'verified' },
    ],
    usbMonitoredDevices: [
      { deviceId: devices[0].deviceId, deviceName: devices[0].deviceName, userName: employees[0].name, userEmail: employees[0].email, deviceStatus: 'active', consentAt: hoursAgo(24 * 10) },
      { deviceId: devices[1].deviceId, deviceName: devices[1].deviceName, userName: employees[1].name, userEmail: employees[1].email, deviceStatus: 'active', consentAt: hoursAgo(24 * 5) },
      { deviceId: devices[2].deviceId, deviceName: devices[2].deviceName, userName: employees[2].name, userEmail: employees[2].email, deviceStatus: 'active', consentAt: hoursAgo(24 * 2) },
    ],
    analytics: {
      actionCounts: { block: 128, warn: 94, allow: 1684 },
      eventTrend: [...eventTrend, ...blockTrend, ...warnTrend],
    },
    aiSafety: {
      coverageLimited: false,
      summary: { averageScore: 87, ratedEmployees: 4, safeInteractions: 347, warningRecoveries: 18 },
      employees: aiEmployees,
      teams: [
        { name: 'Engineering', rank: 1, score: 92, members: 2, safeInteractions: 179 },
        { name: 'Product', rank: 2, score: 91, members: 1, safeInteractions: 92 },
        { name: 'Finance', rank: 3, score: 84, members: 1, safeInteractions: 76 },
      ],
    },
    aiStats: {
      coverageLimited: false,
      summary: { interactions: 2016, averageScore: 87, warningRecoveries: 18 },
      charts: {
        riskDistribution: { LOW: 1360, MEDIUM: 420, HIGH: 190, CRITICAL: 46 },
        dailyTrend: Array.from({ length: 30 }, (_, index) => {
          const date = new Date();
          date.setUTCHours(0, 0, 0, 0);
          date.setUTCDate(date.getUTCDate() - (29 - index));
          const allow = 36 + (index % 7) * 4;
          const warn = 5 + (index % 4);
          const block = 2 + (index % 3);
          return {
            day: date.toISOString().slice(0, 10),
            allow,
            warn,
            block,
            interactions: allow + warn + block,
          };
        }),
      },
      teams: [
        { name: 'Engineering', score: 92, members: 2, interactions: 192, safeInteractions: 179, warningRecoveries: 13, warnings: 10, ignoredWarnings: 1, highRiskAttempts: 1 },
        { name: 'Product', score: 91, members: 1, interactions: 99, safeInteractions: 92, warningRecoveries: 5, warnings: 6, ignoredWarnings: 1, highRiskAttempts: 0 },
        { name: 'Finance', score: 84, members: 1, interactions: 87, safeInteractions: 76, warningRecoveries: 3, warnings: 9, ignoredWarnings: 2, highRiskAttempts: 2 },
      ],
    },
  };
}
