import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { License } from '../models/License';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { Membership } from '../models/Membership';
import { Device } from '../models/Device';
import { SecurityPolicy } from '../models/SecurityPolicy';
import { SecurityEvent } from '../models/SecurityEvent';
import { AuditLog } from '../models/AuditLog';
import { Invitation } from '../models/Invitation';
import { releaseSeatForUser } from '../services/licenseService';
import { createAuditLog } from '../services/auditService';
import { sendInvitationEmail } from '../services/emailService';

export async function getCompanyOverview(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId;
  if (!companyId) {
    res.status(400).json({ error: 'Tenant company ID required' });
    return;
  }

  const [company, license, subscription, totalEmployees, activeDevices, totalIncidents] = await Promise.all([
    Company.findById(companyId),
    License.findOne({ companyId }),
    Subscription.findOne({ companyId }),
    Membership.countDocuments({ companyId, status: 'active' }),
    Device.countDocuments({ companyId, status: 'active' }),
    SecurityEvent.countDocuments({ companyId }),
  ]);

  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }

  const seatLimit = license?.seatLimit || 0;
  const occupiedSeats = license?.occupiedSeats || 0;
  const availableSeats = Math.max(0, seatLimit - occupiedSeats);

  res.json({
    company: {
      id: company._id,
      name: company.name,
      slug: company.slug,
      plan: company.plan,
      status: company.status,
      contactEmail: company.contactEmail,
      createdAt: company.createdAt,
    },
    license: license
      ? {
          id: license._id,
          licenseKey: license.licenseKey,
          plan: license.plan,
          seatLimit,
          occupiedSeats,
          availableSeats,
          status: license.status,
          maxDevicesPerUser: license.maxDevicesPerUser,
          offlineGraceHours: license.offlineGraceHours,
          expiresAt: license.expiresAt,
        }
      : null,
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          seatsPurchased: subscription.seatsPurchased,
          billingInterval: subscription.billingInterval,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    stats: {
      totalEmployees,
      activeDevices,
      totalIncidents,
      seatsUtilizationPercent: seatLimit > 0 ? Math.round((occupiedSeats / seatLimit) * 100) : 0,
    },
  });
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId;

  const memberships = await Membership.find({ companyId })
    .populate('userId', 'name email role isActive hasLicenseSeat createdAt')
    .sort({ createdAt: -1 });

  const invitations = await Invitation.find({
    companyId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  // Get device counts per user
  const devices = await Device.find({ companyId, status: 'active' });
  const deviceCountMap: Record<string, number> = {};
  for (const d of devices) {
    const uid = d.userId.toString();
    deviceCountMap[uid] = (deviceCountMap[uid] || 0) + 1;
  }

  const employees = memberships.map((m) => {
    const u: any = m.userId;
    return {
      membershipId: m._id,
      userId: u?._id,
      name: u?.name || 'Unknown',
      email: u?.email || '',
      role: m.role,
      status: m.status,
      hasSeat: u?.hasLicenseSeat || false,
      isActive: u?.isActive || false,
      deviceCount: u ? deviceCountMap[u._id.toString()] || 0 : 0,
      joinedAt: m.createdAt,
    };
  });

  res.json({
    employees,
    pendingInvitations: invitations.map((inv) => ({
      id: inv._id,
      name: inv.name,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    })),
  });
}

export async function inviteEmployee(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;
  const { email, name, assignLicense = true } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  const company = await Company.findById(companyId);
  const license = await License.findOne({ companyId });

  if (!company || !license) {
    res.status(404).json({ error: 'Company or license not found' });
    return;
  }

  // Check if user is already a member
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const existingMembership = await Membership.findOne({ companyId, userId: existingUser._id });
    if (existingMembership) {
      res.status(400).json({ error: 'This user is already a member of your company workspace.' });
      return;
    }
  }

  // Check if invitation already exists
  const existingInvitation = await Invitation.findOne({
    companyId,
    email: normalizedEmail,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  let invitation;
  if (existingInvitation) {
    existingInvitation.token = inviteToken;
    existingInvitation.expiresAt = expiresAt;
    invitation = await existingInvitation.save();
  } else {
    invitation = await Invitation.create({
      companyId,
      email: normalizedEmail,
      name: name.trim(),
      role: 'employee',
      token: inviteToken,
      assignLicense,
      expiresAt,
      invitedBy: req.user!.id,
    });
  }

  await sendInvitationEmail(
    normalizedEmail,
    name.trim(),
    company.name,
    inviteToken,
    license.licenseKey
  );

  await createAuditLog({
    companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'EMPLOYEE_INVITED',
    entityType: 'Invitation',
    entityId: invitation._id.toString(),
    details: { email: normalizedEmail, name, assignLicense },
    req,
  });

  res.status(201).json({
    message: `Invitation successfully sent to ${normalizedEmail}`,
    invitation: {
      id: invitation._id,
      email: invitation.email,
      name: invitation.name,
      expiresAt: invitation.expiresAt,
    },
  });
}

export async function updateEmployeeStatus(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;
  const { id: targetUserId } = req.params;
  const { isActive, hasLicenseSeat } = req.body;

  const targetUser = await User.findById(targetUserId);
  if (!targetUser || targetUser.companyId?.toString() !== companyId) {
    res.status(404).json({ error: 'Employee not found in your company workspace' });
    return;
  }

  if (targetUser.role === 'company_admin' && targetUser._id.toString() === req.user!.id) {
    if (isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
      return;
    }
  }

  if (isActive !== undefined) {
    targetUser.isActive = isActive;
    if (!isActive && targetUser.hasLicenseSeat) {
      await releaseSeatForUser(companyId, targetUser._id, req.user!);
    }
  }

  if (hasLicenseSeat === false && targetUser.hasLicenseSeat) {
    await releaseSeatForUser(companyId, targetUser._id, req.user!);
  }

  await targetUser.save();

  await createAuditLog({
    companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'EMPLOYEE_STATUS_UPDATED',
    entityType: 'User',
    entityId: targetUser._id.toString(),
    details: { isActive, hasLicenseSeat },
    req,
  });

  res.json({
    message: 'Employee updated successfully',
    employee: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      isActive: targetUser.isActive,
      hasLicenseSeat: targetUser.hasLicenseSeat,
    },
  });
}

export async function removeEmployee(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;
  const { id: targetUserId } = req.params;

  if (targetUserId === req.user!.id) {
    res.status(400).json({ error: 'You cannot remove your own administrator account.' });
    return;
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser || targetUser.companyId?.toString() !== companyId) {
    res.status(404).json({ error: 'Employee not found in this company' });
    return;
  }

  if (targetUser.hasLicenseSeat) {
    await releaseSeatForUser(companyId, targetUser._id, req.user!);
  }

  await Membership.deleteOne({ companyId, userId: targetUser._id });
  targetUser.isActive = false;
  targetUser.companyId = undefined;
  await targetUser.save();

  await createAuditLog({
    companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'EMPLOYEE_REMOVED',
    entityType: 'User',
    entityId: targetUserId,
    details: { email: targetUser.email },
    req,
  });

  res.json({ message: 'Employee successfully removed and seat released.' });
}

export async function listDevices(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;

  const devices = await Device.find({ companyId })
    .populate('userId', 'name email')
    .sort({ lastHeartbeatAt: -1 });

  res.json({
    devices: devices.map((d: any) => ({
      id: d._id,
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      platform: d.platform,
      osVersion: d.osVersion,
      appVersion: d.appVersion,
      status: d.status,
      lastHeartbeatAt: d.lastHeartbeatAt,
      activatedAt: d.activatedAt,
      user: d.userId
        ? {
            id: d.userId._id,
            name: d.userId.name,
            email: d.userId.email,
          }
        : null,
    })),
  });
}

export async function revokeDevice(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;
  const { id: deviceId } = req.params;

  const device = await Device.findOne({
    companyId,
    $or: [
      { _id: mongoose.isValidObjectId(deviceId) ? deviceId : undefined },
      { deviceId },
    ].filter(Boolean),
  });

  if (!device) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  device.status = 'revoked';
  device.revokedAt = new Date();
  await device.save();

  await createAuditLog({
    companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'DEVICE_REVOKED',
    entityType: 'Device',
    entityId: device.deviceId,
    details: { deviceName: device.deviceName, deviceId: device.deviceId },
    req,
  });

  res.json({ message: `Device ${device.deviceName} has been revoked.` });
}

export async function getPolicy(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;

  let policy = await SecurityPolicy.findOne({ companyId });
  if (!policy) {
    policy = await SecurityPolicy.create({
      companyId,
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
      customRules: [],
    });
  }

  res.json({ policy });
}

export async function updatePolicy(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;

  const policy = await SecurityPolicy.findOneAndUpdate(
    { companyId },
    { $set: req.body },
    { new: true, upsert: true }
  );

  await createAuditLog({
    companyId,
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'SECURITY_POLICY_UPDATED',
    entityType: 'SecurityPolicy',
    entityId: policy._id.toString(),
    details: req.body,
    req,
  });

  res.json({ message: 'Security policy updated successfully', policy });
}

export async function listSecurityEvents(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;
  const {
    riskLevel,
    actionTaken,
    category,
    search,
    limit = 50,
    page = 1,
  } = req.query;

  const filter: any = { companyId };

  if (riskLevel) filter.riskLevel = riskLevel;
  if (actionTaken) filter.actionTaken = actionTaken;
  if (category) filter.category = category;

  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { userEmail: { $regex: s, $options: 'i' } },
      { userName: { $regex: s, $options: 'i' } },
      { ruleName: { $regex: s, $options: 'i' } },
      { ruleCode: { $regex: s, $options: 'i' } },
      { deviceName: { $regex: s, $options: 'i' } },
      { targetApp: { $regex: s, $options: 'i' } },
    ];
  }

  const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
  const skip = ((parseInt(String(page), 10) || 1) - 1) * take;

  const [events, total] = await Promise.all([
    SecurityEvent.find(filter).sort({ timestamp: -1 }).skip(skip).limit(take),
    SecurityEvent.countDocuments(filter),
  ]);

  res.json({
    events: events.map((e) => ({
      id: e._id,
      userId: e.userId,
      userEmail: e.userEmail,
      userName: e.userName,
      deviceId: e.deviceId,
      deviceName: e.deviceName,
      targetApp: e.targetApp,
      riskLevel: e.riskLevel,
      ruleCode: e.ruleCode,
      ruleName: e.ruleName,
      category: e.category,
      actionTaken: e.actionTaken,
      redactedPreview: e.redactedPreview,
      explanation: e.explanation,
      timestamp: e.timestamp,
    })),
    pagination: {
      total,
      page: parseInt(String(page), 10) || 1,
      totalPages: Math.ceil(total / take),
      limit: take,
    },
  });
}

export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const companyId = new mongoose.Types.ObjectId(req.tenantCompanyId!);

  // Aggregation for risk level breakdown
  const [riskStats, actionStats, categoryStats, recentIncidents] = await Promise.all([
    SecurityEvent.aggregate([
      { $match: { companyId } },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]),
    SecurityEvent.aggregate([
      { $match: { companyId } },
      { $group: { _id: '$actionTaken', count: { $sum: 1 } } },
    ]),
    SecurityEvent.aggregate([
      { $match: { companyId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    SecurityEvent.find({ companyId }).sort({ timestamp: -1 }).limit(5),
  ]);

  const riskCounts = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const r of riskStats) {
    if (r._id in riskCounts) (riskCounts as any)[r._id] = r.count;
  }

  const actionCounts = {
    allow: 0,
    warn: 0,
    block: 0,
  };
  for (const a of actionStats) {
    if (a._id in actionCounts) (actionCounts as any)[a._id] = a.count;
  }

  res.json({
    riskCounts,
    actionCounts,
    categoryBreakdown: categoryStats.map((c) => ({ category: c._id, count: c.count })),
    recentIncidents,
  });
}

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const companyId = req.tenantCompanyId!;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  const logs = await AuditLog.find({ companyId })
    .sort({ timestamp: -1 })
    .limit(limit);

  res.json({ logs });
}
