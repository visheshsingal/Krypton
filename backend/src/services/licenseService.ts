import crypto from 'crypto';
import mongoose from 'mongoose';
import { License, ILicense } from '../models/License';
import { User, IUser } from '../models/User';
import { Device, IDevice } from '../models/Device';
import { Membership } from '../models/Membership';
import { Company } from '../models/Company';
import { SecurityPolicy } from '../models/SecurityPolicy';
import { createAuditLog } from './auditService';
import { UserRole } from '@krypton/shared';
import {
  calculateCompanyDeviceSeats,
  getSeatsForDeviceCount,
  syncCompanyDeviceSeats,
  withDeviceSeatLock,
} from './deviceSeatService';

/**
 * Generates a cryptographically random, high-entropy enterprise license key.
 * Format: KRYP-XXXX-XXXX-XXXX-XXXX
 */
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
 * Atomic Seat Allocation & License Activation
 * Enforces:
 * 1. License key validity, active status, and unexpired check
 * 2. User identity, membership, and active status
 * 3. One license seat for every two active devices registered to the same user
 * 4. No per-user device cap; company license capacity is enforced atomically
 * 6. Audit logging
 */
export async function activateDesktopDevice(params: ActivationParams): Promise<ActivationResult> {
  const normalizedKey = params.licenseKey.trim().toUpperCase();
  const normalizedEmail = params.email.trim().toLowerCase();

  // 1. Find License
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

  // 3. Find or register User within the company
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

  // Verify company membership
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

  const activation = await withDeviceSeatLock(license._id, async (lockedLicense) => {
    if (lockedLicense.status !== 'active' || lockedLicense.expiresAt <= new Date()) {
      return { error: 'The company license is inactive or expired.' };
    }
    const existingDevice = await Device.findOne({
      companyId: company!._id,
      deviceId: params.deviceId,
    });
    if (existingDevice && existingDevice.userId.toString() !== user!._id.toString()) {
      return { error: 'This device is already registered to another employee.' };
    }
    if (existingDevice?.status === 'revoked') {
      return { error: 'This device was revoked by your administrator.' };
    }

    const activeDeviceCount = await Device.countDocuments({
      userId: user!._id,
      companyId: company!._id,
      status: 'active',
    });
    const occupiedSeats = await calculateCompanyDeviceSeats(company!._id);
    const nextOccupiedSeats = occupiedSeats + (
      existingDevice?.status === 'active'
        ? 0
        : getSeatsForDeviceCount(activeDeviceCount + 1) - getSeatsForDeviceCount(activeDeviceCount)
    );
    if (nextOccupiedSeats > lockedLicense.seatLimit) {
      return { error: `No device license capacity available. Each two active devices use one license seat.` };
    }

    const device = existingDevice || new Device({
      companyId: company!._id,
      userId: user!._id,
      deviceId: params.deviceId,
      deviceName: params.deviceName || 'Krypton Workstation',
      platform: params.platform || 'unknown',
      osVersion: params.osVersion || 'Unknown desktop OS',
      appVersion: params.appVersion || '1.0.0',
    });
    device.status = 'active';
    device.userId = user!._id as mongoose.Types.ObjectId;
    device.deviceName = params.deviceName || device.deviceName;
    device.platform = params.platform || device.platform;
    device.osVersion = params.osVersion || device.osVersion;
    device.appVersion = params.appVersion || device.appVersion;
    device.lastHeartbeatAt = new Date();
    await device.save();

    const needsSignInEnablement = !user!.hasLicenseSeat || !membership!.hasSeat;
    if (needsSignInEnablement) {
      user!.hasLicenseSeat = true;
      membership!.hasSeat = true;
      await Promise.all([user!.save(), membership!.save()]);
    }

    lockedLicense.occupiedSeats = await syncCompanyDeviceSeats(company!._id);
    return { device, occupiedSeats: lockedLicense.occupiedSeats };
  });
  if (!activation) {
    return { success: false, error: 'Device license allocation is busy. Please retry activation.', statusCode: 409 };
  }
  if ('error' in activation) {
    return { success: false, error: activation.error, statusCode: 409 };
  }
  const device = activation.device;
  license.occupiedSeats = activation.occupiedSeats;

  // 6. Fetch company Security Policy
  const policy = await SecurityPolicy.findOne({ companyId: company._id });

  // 7. Audit log activation
  await createAuditLog({
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

/**
 * Release a seat allocated to an employee (called when an employee is deactivated or unassigned)
 */
export async function releaseSeatForUser(
  companyId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string,
  actorUser: { id: string; email: string; role: UserRole }
): Promise<boolean> {
  const user = await User.findById(userId);
  if (!user || !user.hasLicenseSeat) {
    return false;
  }

  const license = await License.findOne({ companyId: new mongoose.Types.ObjectId(companyId) });
  const release = async () => {
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
    await syncCompanyDeviceSeats(companyId);
  };
  if (license) {
    const released = await withDeviceSeatLock(license._id, async () => {
      await release();
      return true;
    });
    if (!released) throw new Error('Device license allocation is busy. Please retry releasing this seat.');
  } else {
    await release();
  }

  await createAuditLog({
    companyId,
    actorId: actorUser.id,
    actorEmail: actorUser.email,
    actorRole: actorUser.role,
    action: 'SEAT_RELEASED',
    entityType: 'User',
    entityId: user._id.toString(),
    details: {
      targetUserEmail: user.email,
    },
  });

  return true;
}
