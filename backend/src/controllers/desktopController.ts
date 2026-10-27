import { Request, Response } from 'express';
import { activateDesktopDevice } from '../services/licenseService';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { Device } from '../models/Device';
import { License } from '../models/License';
import { Company } from '../models/Company';
import { SecurityPolicy } from '../models/SecurityPolicy';
import { SecurityEvent } from '../models/SecurityEvent';
import { createAuditLog } from '../services/auditService';
import crypto from 'crypto';

export async function activateDesktop(req: Request, res: Response): Promise<void> {
  const {
    licenseKey,
    email,
    password,
    deviceId,
    deviceName,
    platform = 'unknown',
    osVersion = 'Unknown desktop OS',
    appVersion = '1.0.0',
  } = req.body;

  const result = await activateDesktopDevice({
    licenseKey,
    email,
    password,
    deviceId,
    deviceName,
    platform,
    osVersion,
    appVersion,
  });

  if (!result.success || !result.user || !result.license || !result.device) {
    res.status(result.statusCode || 400).json({ error: result.error || 'Activation failed' });
    return;
  }

  // Generate tokens for desktop app
  const token = generateAccessToken({
    id: result.user._id.toString(),
    email: result.user.email,
    role: result.user.role,
    companyId: result.license.companyId.toString(),
  });

  const refreshToken = generateRefreshToken({ id: result.user._id.toString() });
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30); // 30 days for desktop

  result.user.refreshTokens.push({
    tokenHash: refreshTokenHash,
    deviceId,
    createdAt: new Date(),
    expiresAt: refreshExpiresAt,
  });
  await result.user.save();

  res.json({
    success: true,
    token,
    refreshToken,
    user: {
      id: result.user._id.toString(),
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      companyId: result.license.companyId.toString(),
    },
    license: {
      id: result.license._id.toString(),
      companyId: result.license.companyId.toString(),
      licenseKey: result.license.licenseKey,
      plan: result.license.plan,
      seatLimit: result.license.seatLimit,
      occupiedSeats: result.license.occupiedSeats,
      status: result.license.status,
      maxDevicesPerUser: result.license.maxDevicesPerUser,
      offlineGraceHours: result.license.offlineGraceHours,
      expiresAt: result.license.expiresAt.toISOString(),
    },
    device: {
      id: result.device._id.toString(),
      deviceId: result.device.deviceId,
      deviceName: result.device.deviceName,
      status: result.device.status,
      activatedAt: result.device.activatedAt.toISOString(),
    },
    policy: result.policy,
  });
}

export async function heartbeat(req: Request, res: Response): Promise<void> {
  const { deviceId, appVersion } = req.body;
  const user = req.user;

  if (!user || !user.companyId) {
    res.status(401).json({ error: 'Unauthenticated device' });
    return;
  }

  const device = await Device.findOne({ companyId: user.companyId, deviceId });
  if (!device || device.status === 'revoked') {
    res.status(403).json({
      valid: false,
      status: 'revoked',
      message: 'This device registration has been revoked by an administrator.',
    });
    return;
  }

  const [company, license] = await Promise.all([
    Company.findById(user.companyId),
    License.findOne({ companyId: user.companyId }),
  ]);
  if (!company || company.status !== 'active' || !license || license.status !== 'active' || new Date() > license.expiresAt) {
    res.status(403).json({
      valid: false,
      status: company?.status === 'suspended' ? 'suspended' : license?.status || 'expired',
      message: company?.status !== 'active' ? 'Company workspace is inactive.' : 'Company license is inactive or expired.',
    });
    return;
  }

  // Update device heartbeat
  device.lastHeartbeatAt = new Date();
  if (appVersion) device.appVersion = appVersion;
  await device.save();

  const policy = await SecurityPolicy.findOne({ companyId: user.companyId });

  res.json({
    valid: true,
    status: 'active',
    policy,
    offlineGraceHours: license.offlineGraceHours || 72,
    nextCheckInMinutes: 60,
  });
}

export async function reportSecurityEvent(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const {
    deviceId,
    targetApp = 'Krypton Demonstration Sandbox',
    riskLevel,
    ruleCode,
    ruleName,
    category,
    actionTaken,
    explanation,
    timestamp,
  } = req.body;

  const device = await Device.findOne({ companyId: user.companyId, deviceId });
  const deviceName = device ? device.deviceName : 'Desktop Workstation';

  const event = await SecurityEvent.create({
    companyId: user.companyId,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    deviceId,
    deviceName,
    targetApp,
    riskLevel,
    ruleCode,
    ruleName,
    category,
    actionTaken,
    redactedPreview: '[Preview withheld; server-side secret scanning is not configured for this endpoint]',
    explanation,
    timestamp: timestamp ? new Date(timestamp) : new Date(),
  });

  res.status(201).json({
    message: 'Security event recorded',
    eventId: event._id,
  });
}

export async function getClientPolicy(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const policy = await SecurityPolicy.findOne({ companyId: user.companyId });
  res.json({ policy });
}
