import { z } from 'zod';

export const RegisterCompanySchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  adminName: z.string().min(2, 'Admin name must be at least 2 characters').max(100),
  adminEmail: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  plan: z.enum(['starter', 'business', 'enterprise']).default('starter'),
  seats: z.number().int().min(1, 'At least 1 seat is required').max(1000).default(5),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(10, 'Valid refresh token is required'),
});

export const CreateLicenseSchema = z.object({
  companyId: z.string().min(1, 'Company ID is required'),
  plan: z.enum(['starter', 'business', 'enterprise']),
  seatLimit: z.number().int().min(1, 'Seat limit must be at least 1').max(10000),
  maxDevicesPerUser: z.number().int().min(1).max(10).default(2),
  offlineGraceHours: z.number().int().min(1).max(720).default(72),
  expiresAt: z.string().datetime().optional(),
});

export const UpdateLicenseSchema = z.object({
  seatLimit: z.number().int().min(1).optional(),
  status: z.enum(['active', 'suspended', 'expired', 'revoked']).optional(),
  maxDevicesPerUser: z.number().int().min(1).max(10).optional(),
  offlineGraceHours: z.number().int().min(1).max(720).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const InviteEmployeeSchema = z.object({
  email: z.string().email('Invalid employee email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  assignLicense: z.boolean().default(true),
});

export const UpdateEmployeeStatusSchema = z.object({
  isActive: z.boolean().optional(),
  hasLicenseSeat: z.boolean().optional(),
});

export const DesktopActivationSchema = z.object({
  licenseKey: z.string().min(8, 'License key must be at least 8 characters'),
  email: z.string().email('Valid employee email is required'),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().min(4, 'Hardware Device ID is required'),
  deviceName: z.string().min(1, 'Device name is required'),
  platform: z.string().default('win32'),
  osVersion: z.string().default('Windows 11'),
  appVersion: z.string().default('1.0.0'),
});

export const HeartbeatSchema = z.object({
  deviceId: z.string().min(4),
  appVersion: z.string().default('1.0.0'),
});

export const SubmitSecurityEventSchema = z.object({
  deviceId: z.string().min(4),
  targetApp: z.string().default('Krypton Demonstration Sandbox'),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  ruleCode: z.string().min(1),
  ruleName: z.string().min(1),
  category: z.enum([
    'api_key',
    'private_key',
    'password',
    'connection_string',
    'cloud_credential',
    'pii',
    'custom_keyword',
    'custom_regex',
  ]),
  actionTaken: z.enum(['allow', 'warn', 'block']),
  redactedPreview: z.string().max(2000),
  explanation: z.string().max(1000),
  timestamp: z.string().datetime().optional(),
});

export const UpdatePolicySchema = z.object({
  blockCriticalRisk: z.boolean().optional(),
  blockHighRisk: z.boolean().optional(),
  warnMediumRisk: z.boolean().optional(),
  allowLowRisk: z.boolean().optional(),
  allowEmployeeBypassWarning: z.boolean().optional(),
  enablePiiDetection: z.boolean().optional(),
  enableSecretDetection: z.boolean().optional(),
  enableCustomRules: z.boolean().optional(),
  maxDevicesPerUser: z.number().int().min(1).max(10).optional(),
  offlineGracePeriodHours: z.number().int().min(1).max(720).optional(),
  fullPromptLoggingEnabled: z.boolean().optional(),
  customRules: z
    .array(
      z.object({
        ruleCode: z.string().min(2),
        name: z.string().min(2),
        description: z.string().default(''),
        category: z.enum([
          'api_key',
          'private_key',
          'password',
          'connection_string',
          'cloud_credential',
          'pii',
          'custom_keyword',
          'custom_regex',
        ]),
        pattern: z.string().optional(),
        riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        action: z.enum(['allow', 'warn', 'block']),
        isEnabled: z.boolean().default(true),
        isBuiltIn: z.boolean().default(false),
        explanation: z.string().default(''),
      })
    )
    .optional(),
});

export const ContactDemoSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Work email is required'),
  company: z.string().min(2, 'Company name is required'),
  seatsNeeded: z.number().int().min(1).default(25),
  message: z.string().min(5, 'Message must be at least 5 characters'),
});
