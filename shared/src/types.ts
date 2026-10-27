export type UserRole = 'super_admin' | 'company_admin' | 'employee';

export type SubscriptionPlan = 'starter' | 'business' | 'enterprise';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';

export type LicenseStatus = 'active' | 'suspended' | 'expired' | 'revoked';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EnforcementAction = 'allow' | 'warn' | 'block';

export type DeviceStatus = 'active' | 'revoked' | 'offline';

export type DetectionCategory =
  | 'api_key'
  | 'private_key'
  | 'password'
  | 'connection_string'
  | 'cloud_credential'
  | 'pii'
  | 'custom_keyword'
  | 'custom_regex';

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  domain?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseInfo {
  id: string;
  companyId: string;
  companyName?: string;
  licenseKey: string;
  plan: SubscriptionPlan;
  seatLimit: number;
  occupiedSeats: number;
  availableSeats: number;
  status: LicenseStatus;
  maxDevicesPerUser: number;
  offlineGraceHours: number;
  expiresAt: string;
  createdAt: string;
}

export interface DeviceInfo {
  id: string;
  companyId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  status: DeviceStatus;
  lastHeartbeatAt: string;
  activatedAt: string;
}

export interface DetectionRuleDTO {
  id?: string;
  ruleCode: string;
  name: string;
  description: string;
  category: DetectionCategory;
  pattern?: string;
  riskLevel: RiskLevel;
  action: EnforcementAction;
  isEnabled: boolean;
  isBuiltIn: boolean;
  explanation: string;
}

export interface SecurityPolicyDTO {
  id?: string;
  companyId: string;
  blockCriticalRisk: boolean;
  blockHighRisk: boolean;
  warnMediumRisk: boolean;
  allowLowRisk: boolean;
  allowEmployeeBypassWarning: boolean;
  enablePiiDetection: boolean;
  enableSecretDetection: boolean;
  enableCustomRules: boolean;
  customRules: DetectionRuleDTO[];
  maxDevicesPerUser: number;
  offlineGracePeriodHours: number;
  fullPromptLoggingEnabled: boolean;
  updatedAt?: string;
}

export interface SecurityEventDTO {
  id?: string;
  companyId: string;
  userId: string;
  userEmail: string;
  userName: string;
  deviceId: string;
  deviceName: string;
  targetApp: string; // e.g. "Krypton Demonstration Sandbox", "ChatGPT", "Claude"
  riskLevel: RiskLevel;
  ruleCode: string;
  ruleName: string;
  category: DetectionCategory;
  actionTaken: EnforcementAction;
  redactedPreview: string; // Safe, redacted snippet
  explanation: string;
  timestamp: string;
}

export interface AuditLogDTO {
  id?: string;
  companyId?: string;
  actorId: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface PromptScanMatch {
  ruleCode: string;
  ruleName: string;
  category: DetectionCategory;
  riskLevel: RiskLevel;
  action: EnforcementAction;
  explanation: string;
  start: number;
  end: number;
  redactedText: string;
}

export interface PromptScanResult {
  hasRisk: boolean;
  highestRisk: RiskLevel;
  action: EnforcementAction;
  matches: PromptScanMatch[];
  redactedPrompt: string;
  explanation: string;
}

export interface DesktopActivationRequest {
  licenseKey: string;
  email: string;
  password?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

export interface DesktopActivationResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  license?: LicenseInfo;
  policy?: SecurityPolicyDTO;
  user?: UserSummary;
  device?: DeviceInfo;
  error?: string;
}

export interface HeartbeatRequest {
  deviceId: string;
  appVersion: string;
}

export interface HeartbeatResponse {
  valid: boolean;
  status: LicenseStatus;
  policy?: SecurityPolicyDTO;
  offlineGraceHours: number;
  nextCheckInMinutes: number;
  message?: string;
}
