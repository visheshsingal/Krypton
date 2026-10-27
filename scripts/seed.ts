import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { connectDB } from '../lib/db';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Membership } from '../models/Membership';
import { License } from '../models/License';
import { Device } from '../models/Device';
import { SecurityPolicy } from '../models/SecurityPolicy';
import { DetectionRule } from '../models/DetectionRule';
import { SecurityEvent } from '../models/SecurityEvent';
import { AuditLog } from '../models/AuditLog';

async function seed() {
  const superAdminEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
  const superAdminName = process.env.SUPERADMIN_NAME?.trim() || 'Krypton Root Administrator';

  if (!superAdminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(superAdminEmail)) {
    throw new Error('Set SUPERADMIN_EMAIL to the platform owner email before running the seed script.');
  }
  if (!superAdminPassword || superAdminPassword.length < 12) {
    throw new Error('Set SUPERADMIN_PASSWORD to a unique password with at least 12 characters before running the seed script.');
  }

  console.log('[Seed] Seeding Krypton database on MongoDB Atlas...');
  await connectDB();

  // 1. Seed Global Built-in Detection Rules
  const builtInRules = [
    {
      ruleCode: 'API_KEY_OPENAI',
      name: 'OpenAI Secret Key',
      description: 'Detects OpenAI platform secret keys (sk-... and sk-proj-...)',
      category: 'api_key',
      pattern: '\\bsk-(?!ant-)(?:proj-)?[a-zA-Z0-9_\\-]{24,}\\b',
      riskLevel: 'CRITICAL',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'OpenAI API key detected. Leaking API keys allows unauthorized access to company AI infrastructure.',
    },
    {
      ruleCode: 'API_KEY_ANTHROPIC',
      name: 'Anthropic Claude API Key',
      description: 'Detects Anthropic API tokens starting with sk-ant-',
      category: 'api_key',
      pattern: '\\bsk-ant-(?:api03-)?[a-zA-Z0-9_\\-]{32,}\\b',
      riskLevel: 'CRITICAL',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Anthropic API key detected. Prompts containing production keys must not be shared.',
    },
    {
      ruleCode: 'CLOUD_AWS_KEY',
      name: 'AWS Access Key ID',
      description: 'Detects standard 20-character AWS access keys starting with AKIA',
      category: 'cloud_credential',
      pattern: 'AKIA[0-9A-Z]{16}',
      riskLevel: 'CRITICAL',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'AWS Access Key detected. Exposing root or IAM access keys presents severe infrastructure risk.',
    },
    {
      ruleCode: 'TOKEN_GITHUB',
      name: 'GitHub Personal Access Token',
      description: 'Detects fine-grained or classic GitHub tokens (ghp_, gho_, etc.)',
      category: 'api_key',
      pattern: 'gh[pousr]_[A-Za-z0-9_]{36,255}',
      riskLevel: 'CRITICAL',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'GitHub authentication token detected. Code repositories and CI/CD pipelines can be compromised.',
    },
    {
      ruleCode: 'TOKEN_SLACK',
      name: 'Slack Bot / User Token',
      description: 'Detects Slack workspace authentication tokens',
      category: 'api_key',
      pattern: 'xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}',
      riskLevel: 'HIGH',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Slack bot or user token detected. Prevents unauthorized internal communication channel access.',
    },
    {
      ruleCode: 'PRIVATE_KEY',
      name: 'Asymmetric Private Key (RSA / EC / SSH)',
      description: 'Detects standard PEM-encoded private cryptographic key headers',
      category: 'private_key',
      pattern: '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
      riskLevel: 'CRITICAL',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Cryptographic private key detected. Private keys must never leave secure key stores or HSMs.',
    },
    {
      ruleCode: 'CONN_STRING_DB',
      name: 'Database Connection String with Credentials',
      description: 'Detects database connection URIs containing username and password',
      category: 'connection_string',
      pattern: '(?:mongodb(?:\\+srv)?|postgres|postgresql|mysql|redis):\\/\\/[^:\\s]+:[^@\\s]+@[^\\s]+',
      riskLevel: 'CRITICAL',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Database URI containing embedded credentials detected. Exposes backend databases to unauthorized access.',
    },
    {
      ruleCode: 'PASSWORD_IN_PROMPT',
      name: 'Plaintext Password Assignment',
      description: 'Detects phrases assigning plaintext passwords or secrets in prompts',
      category: 'password',
      pattern: '(?:password|passwd|pwd)\\s*[:=]\\s*["\']?[^\\s"\']{6,}',
      riskLevel: 'HIGH',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Explicit password assignment detected in prompt content.',
    },
    {
      ruleCode: 'PII_CREDIT_CARD',
      name: 'Payment Card Number (PCI-DSS)',
      description: 'Detects formatted credit card numbers with standard card prefix ranges',
      category: 'pii',
      pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b',
      riskLevel: 'HIGH',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Credit card number detected. Violates PCI-DSS compliance policy.',
    },
    {
      ruleCode: 'PII_SSN',
      name: 'US Social Security Number',
      description: 'Detects 9-digit US SSN formatted patterns',
      category: 'pii',
      pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      riskLevel: 'HIGH',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Social Security Number detected. Regulated personally identifiable information.',
    },
  ];

  if (process.env.SEED_GLOBAL_RULES === 'true') {
    for (const r of builtInRules) {
      await DetectionRule.findOneAndUpdate(
        { ruleCode: r.ruleCode, companyId: null },
        { ...r, companyId: null },
        { upsert: true }
      );
    }
    console.log(`[Seed] Seeded ${builtInRules.length} global built-in detection rules.`);
  }

  // 2. Bootstrap Super Admin Account
  const superAdminPasswordHash = await bcrypt.hash(superAdminPassword, 12);

  let superAdmin = await User.findOne({
    $or: [
      { email: superAdminEmail },
      { email: 'admin@kryptonsecurity.com' },
      { email: 'superadmin@kryptonsecurity.com' },
    ],
  });

  if (!superAdmin) {
    superAdmin = await User.create({
      email: superAdminEmail,
      passwordHash: superAdminPasswordHash,
      name: superAdminName,
      role: 'super_admin',
      isActive: true,
      hasLicenseSeat: false,
    });
    console.log(`[Seed] Created Super Admin: ${superAdminEmail}`);
  } else {
    superAdmin.email = superAdminEmail;
    superAdmin.passwordHash = superAdminPasswordHash;
    superAdmin.name = superAdminName;
    superAdmin.role = 'super_admin';
    await superAdmin.save();
    console.log(`[Seed] Updated Super Admin password: ${superAdminEmail}`);
  }

  if (process.env.SEED_DEMO_DATA === 'true') {
  // 3. Seed Demo Company: Acme Financial Technologies
  const demoEmail = 'alex.morgan@acmefintech.io';
  const demoPasswordHash = await bcrypt.hash('Password123!', 12);

  let demoCompany = await Company.findOne({ slug: 'acme-fintech' });
  if (!demoCompany) {
    demoCompany = await Company.create({
      name: 'Acme Financial Technologies',
      slug: 'acme-fintech',
      domain: 'acmefintech.io',
      plan: 'business',
      status: 'active',
      contactEmail: demoEmail,
      settings: {
        allowedDomains: ['acmefintech.io'],
        defaultMaxDevices: 2,
        defaultOfflineGraceHours: 72,
      },
    });
    console.log(`[Seed] Created demo company: ${demoCompany.name}`);
  }

  let demoAdmin = await User.findOne({ email: demoEmail });
  if (!demoAdmin) {
    demoAdmin = await User.create({
      email: demoEmail,
      passwordHash: demoPasswordHash,
      name: 'Alex Morgan',
      role: 'company_admin',
      companyId: demoCompany._id,
      isActive: true,
      hasLicenseSeat: true,
    });
  } else {
    demoAdmin.passwordHash = demoPasswordHash;
    demoAdmin.companyId = demoCompany._id as any;
    demoAdmin.role = 'company_admin';
    demoAdmin.hasLicenseSeat = true;
    await demoAdmin.save();
  }

  await Membership.findOneAndUpdate(
    { userId: demoAdmin._id, companyId: demoCompany._id },
    { role: 'company_admin', status: 'active', hasSeat: true },
    { upsert: true }
  );

  // 4. Seed Demo License with known key
  const demoLicenseKey = 'KRYP-ACME-2026-SECR-8899';
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  await License.findOneAndUpdate(
    { companyId: demoCompany._id },
    {
      companyId: demoCompany._id,
      licenseKey: demoLicenseKey,
      plan: 'business',
      seatLimit: 10,
      occupiedSeats: 3,
      status: 'active',
      maxDevicesPerUser: 2,
      offlineGraceHours: 72,
      expiresAt: oneYearFromNow,
      createdBy: demoAdmin._id,
    },
    { upsert: true }
  );

  // 5. Seed Security Policy
  await SecurityPolicy.findOneAndUpdate(
    { companyId: demoCompany._id },
    {
      companyId: demoCompany._id,
      blockCriticalRisk: true,
      blockHighRisk: true,
      warnMediumRisk: true,
      allowLowRisk: true,
      allowEmployeeBypassWarning: true,
      enablePiiDetection: true,
      enableSecretDetection: true,
      enableCustomRules: true,
      maxDevicesPerUser: 2,
      offlineGracePeriodHours: 72,
      fullPromptLoggingEnabled: false,
      customRules: [
        {
          ruleCode: 'CUSTOM_INTERNAL_ACME_PROJECT',
          name: 'Project Apollo Confidential Code',
          description: 'Detects internal Project Apollo code names and financial models.',
          category: 'custom_keyword',
          pattern: 'project-apollo-v[0-9]+|apollo_secret_model',
          riskLevel: 'HIGH',
          action: 'block',
          isEnabled: true,
          isBuiltIn: false,
          explanation: 'Internal trade secret: Project Apollo references are prohibited in external AI prompts.',
        },
      ],
    },
    { upsert: true }
  );

  // 6. Seed Employees
  const employeesData = [
    { name: 'Rahul Sharma', email: 'dev.rahul@acmefintech.io', hasSeat: true },
    { name: 'Sarah Jenkins', email: 'data.sarah@acmefintech.io', hasSeat: true },
    { name: 'Kevin Zhang', email: 'intern.kevin@acmefintech.io', hasSeat: false },
  ];

  for (const emp of employeesData) {
    let empUser = await User.findOne({ email: emp.email });
    if (!empUser) {
      empUser = await User.create({
        name: emp.name,
        email: emp.email,
        passwordHash: demoPasswordHash,
        role: 'employee',
        companyId: demoCompany._id,
        isActive: true,
        hasLicenseSeat: emp.hasSeat,
      });
    } else {
      empUser.hasLicenseSeat = emp.hasSeat;
      await empUser.save();
    }

    await Membership.findOneAndUpdate(
      { userId: empUser._id, companyId: demoCompany._id },
      { role: 'employee', status: 'active', hasSeat: emp.hasSeat },
      { upsert: true }
    );
  }

  // 7. Seed Sample Incidents
  const device1Id = 'WIN-ACME-01-HWID-99238';
  await Device.findOneAndUpdate(
    { companyId: demoCompany._id, deviceId: device1Id },
    {
      companyId: demoCompany._id,
      userId: demoAdmin._id,
      deviceId: device1Id,
      deviceName: "Alex's ThinkPad X1 Carbon",
      platform: 'win32',
      osVersion: 'Windows 11 Pro 23H2',
      appVersion: '1.0.0',
      status: 'active',
      lastHeartbeatAt: new Date(),
      activatedAt: new Date(),
    },
    { upsert: true }
  );

  await SecurityEvent.deleteMany({ companyId: demoCompany._id });
  await SecurityEvent.create([
    {
      companyId: demoCompany._id,
      userId: demoAdmin._id,
      userEmail: demoAdmin.email,
      userName: demoAdmin.name,
      deviceId: device1Id,
      deviceName: "Alex's ThinkPad X1 Carbon",
      targetApp: 'ChatGPT Web',
      riskLevel: 'CRITICAL',
      ruleCode: 'API_KEY_OPENAI',
      ruleName: 'OpenAI Secret Key',
      category: 'api_key',
      actionTaken: 'block',
      redactedPreview: 'Please debug this script: const client = new OpenAI({ apiKey: "[REDACTED: API_KEY_OPENAI]" });',
      explanation: 'Blocked attempt to submit raw production OpenAI secret key.',
      timestamp: new Date(Date.now() - 3600000 * 2),
    },
    {
      companyId: demoCompany._id,
      userId: demoAdmin._id,
      userEmail: demoAdmin.email,
      userName: demoAdmin.name,
      deviceId: device1Id,
      deviceName: "Alex's ThinkPad X1 Carbon",
      targetApp: 'Claude Desktop',
      riskLevel: 'CRITICAL',
      ruleCode: 'CONN_STRING_DB',
      ruleName: 'Database Connection String with Credentials',
      category: 'connection_string',
      actionTaken: 'block',
      redactedPreview: 'Analyze query performance for uri="[REDACTED: CONN_STRING_DB]"',
      explanation: 'Blocked database connection string containing embedded credentials.',
      timestamp: new Date(Date.now() - 3600000 * 18),
    },
  ]);

  }
  console.log('[Seed] Database seeding completed successfully!');
  console.log(`  Super Admin: ${superAdminEmail}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Seeding error:', err);
  process.exit(1);
});
