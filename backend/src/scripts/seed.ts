import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { config } from '../config/env';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Membership } from '../models/Membership';
import { License } from '../models/License';
import { Subscription } from '../models/Subscription';
import { Device } from '../models/Device';
import { SecurityPolicy } from '../models/SecurityPolicy';
import { DetectionRule } from '../models/DetectionRule';
import { SecurityEvent } from '../models/SecurityEvent';
import { AuditLog } from '../models/AuditLog';

export async function seedDatabase() {
  if (!process.env.SUPERADMIN_EMAIL) {
    throw new Error('Set SUPERADMIN_EMAIL before running the seed script.');
  }
  if (config.superAdmin.password.length < 12) {
    throw new Error('Set ADMIN_PASSWORD or SUPERADMIN_PASSWORD to a unique password with at least 12 characters.');
  }

  console.log('[Seed] Starting Krypton platform database seeding...');
  await connectDatabase();

  // 1. Seed Global Built-in Detection Rules
  const builtInRules = [
    {
      ruleCode: 'API_KEY_OPENAI',
      name: 'OpenAI API Secret Key',
      description: 'Detects OpenAI platform secret keys (legacy and project-scoped).',
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
      description: 'Detects Anthropic API tokens starting with sk-ant-.',
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
      description: 'Detects standard 20-character AWS access keys starting with AKIA.',
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
      description: 'Detects modern fine-grained or classic GitHub tokens (ghp_, gho_, etc.).',
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
      description: 'Detects Slack workspace authentication tokens.',
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
      description: 'Detects standard PEM-encoded private cryptographic key headers.',
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
      description: 'Detects database connection URIs containing username and password.',
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
      description: 'Detects phrases assigning plaintext passwords or secrets in prompts.',
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
      description: 'Detects formatted credit card numbers with standard card prefix ranges.',
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
      description: 'Detects 9-digit US SSN formatted patterns.',
      category: 'pii',
      pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      riskLevel: 'HIGH',
      action: 'block',
      isEnabled: true,
      isBuiltIn: true,
      explanation: 'Social Security Number detected. Regulated personally identifiable information.',
    },
  ];

  for (const r of builtInRules) {
    await DetectionRule.findOneAndUpdate(
      { ruleCode: r.ruleCode, companyId: null },
      { ...r, companyId: null },
      { upsert: true }
    );
  }
  console.log(`[Seed] Seeded ${builtInRules.length} global built-in detection rules.`);

  // 2. Bootstrap Super Admin Account
  const superAdminEmail = 'admin@kryptonsecurity.com';
  let superAdmin = await User.findOne({
    $or: [{ email: superAdminEmail }, { email: 'superadmin@kryptonsecurity.com' }],
  });
  const superAdminPasswordHash = await bcrypt.hash(config.superAdmin.password, 12);

  if (!superAdmin) {
    superAdmin = await User.create({
      email: superAdminEmail,
      passwordHash: superAdminPasswordHash,
      name: config.superAdmin.name,
      role: 'super_admin',
      isActive: true,
      hasLicenseSeat: false,
    });
    console.log(`[Seed] Created Super Admin: ${superAdminEmail}`);
  } else {
    superAdmin.email = superAdminEmail;
    superAdmin.passwordHash = superAdminPasswordHash;
    superAdmin.role = 'super_admin';
    await superAdmin.save();
    console.log(`[Seed] Updated Super Admin password: ${superAdminEmail}`);
  }

  // 3. Seed Demo Company: Acme Financial Technologies
  const demoEmail = 'alex.morgan@acmefintech.io';
  let demoAdmin = await User.findOne({ email: demoEmail });
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

  let demoLicense = await License.findOne({ companyId: demoCompany._id });
  if (!demoLicense) {
    demoLicense = await License.create({
      companyId: demoCompany._id,
      licenseKey: demoLicenseKey,
      plan: 'business',
      seatLimit: 10,
      occupiedSeats: 3, // Alex, Rahul, Sarah
      status: 'active',
      maxDevicesPerUser: 2,
      offlineGraceHours: 72,
      expiresAt: oneYearFromNow,
      createdBy: demoAdmin._id,
    });
  } else {
    demoLicense.seatLimit = 10;
    demoLicense.occupiedSeats = 3;
    demoLicense.status = 'active';
    demoLicense.licenseKey = demoLicenseKey;
    demoLicense.expiresAt = oneYearFromNow;
    await demoLicense.save();
  }

  // 5. Seed Subscription
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  await Subscription.findOneAndUpdate(
    { companyId: demoCompany._id },
    {
      companyId: demoCompany._id,
      plan: 'business',
      status: 'active',
      seatsPurchased: 10,
      billingInterval: 'month',
      amountPerSeatCents: 1900,
      currentPeriodStart: new Date(),
      currentPeriodEnd: nextMonth,
    },
    { upsert: true }
  );

  // 6. Seed Security Policy
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

  // 7. Seed Employees
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

  // 8. Seed Registered Devices
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

  const rahulUser = await User.findOne({ email: 'dev.rahul@acmefintech.io' });
  if (rahulUser) {
    const device2Id = 'WIN-ACME-02-HWID-44120';
    await Device.findOneAndUpdate(
      { companyId: demoCompany._id, deviceId: device2Id },
      {
        companyId: demoCompany._id,
        userId: rahulUser._id,
        deviceId: device2Id,
        deviceName: "Rahul's Dell Precision 5570",
        platform: 'win32',
        osVersion: 'Windows 11 Enterprise',
        appVersion: '1.0.0',
        status: 'active',
        lastHeartbeatAt: new Date(),
        activatedAt: new Date(),
      },
      { upsert: true }
    );
  }

  // 9. Seed Sample Redacted Security Incidents
  const sampleEvents = [
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
      ruleName: 'OpenAI API Secret Key',
      category: 'api_key',
      actionTaken: 'block',
      redactedPreview: 'Please debug this script: const client = new OpenAI({ apiKey: "[REDACTED: API_KEY_OPENAI]" });',
      explanation: 'Blocked attempt to submit raw production OpenAI secret key.',
      timestamp: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    },
    {
      companyId: demoCompany._id,
      userId: rahulUser?._id || demoAdmin._id,
      userEmail: rahulUser?.email || demoAdmin.email,
      userName: rahulUser?.name || demoAdmin.name,
      deviceId: 'WIN-ACME-02-HWID-44120',
      deviceName: "Rahul's Dell Precision 5570",
      targetApp: 'Claude Desktop',
      riskLevel: 'CRITICAL',
      ruleCode: 'CONN_STRING_DB',
      ruleName: 'Database Connection String with Credentials',
      category: 'connection_string',
      actionTaken: 'block',
      redactedPreview: 'Analyze query performance for uri="[REDACTED: CONN_STRING_DB]"',
      explanation: 'Blocked database connection string containing embedded credentials.',
      timestamp: new Date(Date.now() - 3600000 * 18), // 18 hours ago
    },
    {
      companyId: demoCompany._id,
      userId: demoAdmin._id,
      userEmail: demoAdmin.email,
      userName: demoAdmin.name,
      deviceId: device1Id,
      deviceName: "Alex's ThinkPad X1 Carbon",
      targetApp: 'Krypton Demonstration Sandbox',
      riskLevel: 'HIGH',
      ruleCode: 'PII_CREDIT_CARD',
      ruleName: 'Payment Card Number (PCI-DSS)',
      category: 'pii',
      actionTaken: 'block',
      redactedPreview: 'Customer inquiry regarding charge on card [REDACTED: PII_CREDIT_CARD] for billing dispute.',
      explanation: 'Payment card number detected under PCI-DSS compliance policy.',
      timestamp: new Date(Date.now() - 3600000 * 28), // 28 hours ago
    },
  ];

  await SecurityEvent.deleteMany({ companyId: demoCompany._id });
  await SecurityEvent.insertMany(sampleEvents);

  // 10. Audit Log
  await AuditLog.create({
    companyId: demoCompany._id,
    actorId: demoAdmin._id,
    actorEmail: demoAdmin.email,
    actorRole: 'company_admin',
    action: 'SYSTEM_INITIALIZED',
    entityType: 'Company',
    entityId: demoCompany._id.toString(),
    details: { licenseKey: demoLicenseKey, plan: 'business', seats: 10 },
    timestamp: new Date(),
  });

  console.log('[Seed] Database seeding completed successfully!');
  console.log('=====================================================');
  console.log('Super Admin Credentials:');
  console.log(`  Email:    ${superAdminEmail}`);
  console.log('  Password: configured via environment (not displayed)');
  console.log('Company Admin Credentials:');
  console.log(`  Email:    ${demoEmail}`);
  console.log('  Password: Password123!');
  console.log(`  License:  ${demoLicenseKey}`);
  console.log('=====================================================');
}

// Direct execution
if (require.main === module) {
  seedDatabase()
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Seeding failed:', err);
      await disconnectDatabase();
      process.exit(1);
    });
}
