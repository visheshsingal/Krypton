import crypto from 'crypto';
import mongoose from 'mongoose';
import { License, ILicense } from '@/models/License';
import { User, IUser } from '@/models/User';
import { Device, IDevice } from '@/models/Device';
import { Membership } from '@/models/Membership';
import { Company } from '@/models/Company';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { logAuditEvent } from './audit';

export function generateLicenseKey(): string {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return `KRYP-${parts.join('-')}`;
}

export interface ActivationParams {
  licenseKey: string;
  email: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface ActivationResult {
  success: boolean;
  user?: IUser;
  license?: ILicense;
  device?: IDevice;
  policy?: any;
  error?: string;
  statusCode?: number;
}

/**
 * Concurrency-Safe Atomic Seat Allocation & License Activation
 */
export async function activateDesktopDevice(params: ActivationParams): Promise<ActivationResult> {
  const normalizedKey = params.licenseKey.trim().toUpperCase();
  const normalizedEmail = params.email.trim().toLowerCase();

  // 1. Verify License
  const license = await License.findOne({ licenseKey: normalizedKey });
  if (!license) {
    return { success: false, error: 'Invalid license key provided.', statusCode: 404 };
  }

  if (license.status !== 'active') {
    return {
      success: false,
      error: `License is currently ${license.status}. Please contact your administrator.`,
      statusCode: 403,
    };
  }

  if (new Date() > license.expiresAt) {
    license.status = 'expired';
    await license.save();
    return {
      success: false,
      error: 'License has expired. Please contact your company administrator to renew.',
      statusCode: 403,
    };
  }

  // 2. Verify Company
  const company = await Company.findById(license.companyId);
  if (!company || company.status !== 'active') {
    return {
      success: false,
      error: 'The company workspace associated with this license is inactive.',
      statusCode: 403,
    };
  }

  // 3. Verify User & Membership
  let user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return {
      success: false,
      error: 'Employee account not found. Please ask your company administrator to invite you first.',
      statusCode: 404,
    };
  }

  if (!user.isActive) {
    return {
      success: false,
      error: 'Your user account has been deactivated by the company administrator.',
      statusCode: 403,
    };
  }

  if (!params.password || !(await user.comparePassword(params.password))) {
    return { success: false, error: 'Invalid email or password.', statusCode: 401 };
  }

  const membership = await Membership.findOne({
    userId: user._id,
    companyId: company._id,
    status: 'active',
  });

  if (!membership) {
    return {
      success: false,
      error: 'User is not an active member of the company associated with this license.',
      statusCode: 403,
    };
  }

  // 4. Atomic Seat Allocation:
  // If user does not yet have a seat allocated, increment occupiedSeats atomically
  if (!user.hasLicenseSeat) {
    const updatedLicense = await License.findOneAndUpdate(
      {
        _id: license._id,
        status: 'active',
        $expr: { $lt: ['$occupiedSeats', '$seatLimit'] },
      },
      {
        $inc: { occupiedSeats: 1 },
      },
      { new: true }
    );

    if (!updatedLicense) {
      return {
        success: false,
        error: `All ${license.seatLimit} purchased seats are currently occupied. Please request additional seats from your administrator.`,
        statusCode: 409,
      };
    }

    user.hasLicenseSeat = true;
    await user.save();

    membership.hasSeat = true;
    await membership.save();

    await logAuditEvent({
      companyId: company._id,
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SEAT_ALLOCATED_ATOMICALLY',
      entityType: 'License',
      entityId: license._id.toString(),
      details: {
        occupiedSeats: updatedLicense.occupiedSeats,
        seatLimit: updatedLicense.seatLimit,
        userId: user._id.toString(),
      },
    });
  }

  // 5. Device Registration and Limit Check
  const maxDevices = license.maxDevicesPerUser || 2;
  const existingDevices = await Device.find({
    userId: user._id,
    companyId: company._id,
    status: 'active',
  });

  let device = await Device.findOne({
    companyId: company._id,
    deviceId: params.deviceId,
  });

  if (device) {
    device.status = 'active';
    device.userId = user._id as mongoose.Types.ObjectId;
    device.deviceName = params.deviceName || device.deviceName;
    device.platform = params.platform || device.platform;
    device.osVersion = params.osVersion || device.osVersion;
    device.appVersion = params.appVersion || device.appVersion;
    device.lastHeartbeatAt = new Date();
    await device.save();
  } else {
    if (existingDevices.length >= maxDevices) {
      return {
        success: false,
        error: `Maximum allowed active devices (${maxDevices}) reached for this user account. Please revoke an unused device from your company dashboard.`,
        statusCode: 403,
      };
    }

    device = await Device.create({
      companyId: company._id,
      userId: user._id,
      deviceId: params.deviceId,
      deviceName: params.deviceName || 'Windows Workstation',
      platform: params.platform || 'win32',
      osVersion: params.osVersion || 'Windows 11',
      appVersion: params.appVersion || '1.0.0',
      status: 'active',
      lastHeartbeatAt: new Date(),
      activatedAt: new Date(),
    });
  }

  // 6. Security Policy
  const policy = await SecurityPolicy.findOne({ companyId: company._id });

  await logAuditEvent({
    companyId: company._id,
    actorId: user._id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'DESKTOP_DEVICE_ACTIVATED',
    entityType: 'Device',
    entityId: device.deviceId,
    details: {
      deviceName: device.deviceName,
      platform: device.platform,
      appVersion: device.appVersion,
    },
  });

  return {
    success: true,
    user,
    license,
    device,
    policy,
  };
}

export async function releaseSeatForUser(
  companyId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string,
  actorUser: { id: string; email: string; role: 'super_admin' | 'company_admin' | 'employee' }
): Promise<boolean> {
  const user = await User.findById(userId);
  if (!user || !user.hasLicenseSeat) {
    return false;
  }

  await License.findOneAndUpdate(
    { companyId: new mongoose.Types.ObjectId(companyId), occupiedSeats: { $gt: 0 } },
    { $inc: { occupiedSeats: -1 } }
  );

  user.hasLicenseSeat = false;
  await user.save();

  await Membership.findOneAndUpdate(
    { userId: user._id, companyId: new mongoose.Types.ObjectId(companyId) },
    { hasSeat: false }
  );

  await Device.updateMany(
    { userId: user._id, companyId: new mongoose.Types.ObjectId(companyId), status: 'active' },
    { status: 'revoked', revokedAt: new Date() }
  );

  await logAuditEvent({
    companyId,
    actorId: actorUser.id,
    actorEmail: actorUser.email,
    actorRole: actorUser.role,
    action: 'SEAT_RELEASED',
    entityType: 'User',
    entityId: user._id.toString(),
    details: { targetUserEmail: user.email },
  });

  return true;
}
