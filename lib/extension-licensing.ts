import crypto from 'crypto';
import mongoose from 'mongoose';
import { Company } from '@/models/Company';
import { Device } from '@/models/Device';
import { ILicense, License } from '@/models/License';
import { Membership } from '@/models/Membership';
import { Subscription } from '@/models/Subscription';
import { User } from '@/models/User';

export type ExtensionEntitlement = {
  valid: boolean;
  reason?: 'license_invalid' | 'subscription_invalid' | 'device_revoked' | 'user_invalid';
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  license?: ILicense;
};

export async function validateExtensionEntitlement(input: {
  companyId: string;
  userId: string;
  deviceId: string;
}): Promise<ExtensionEntitlement> {
  const companyId = new mongoose.Types.ObjectId(input.companyId);
  const userId = new mongoose.Types.ObjectId(input.userId);
  const [company, user, device, membership, license, subscription] = await Promise.all([
    Company.findById(companyId).select('status'),
    User.findById(userId).select('isActive hasLicenseSeat'),
    Device.findOne({ companyId, userId, deviceId: input.deviceId, status: 'active' }),
    Membership.findOne({ companyId, userId, status: 'active', hasSeat: true }),
    License.findOne({ companyId }),
    Subscription.findOne({ companyId }),
  ]);

  const base = { companyId, userId, deviceId: input.deviceId, license: license || undefined };
  if (!company || company.status !== 'active' || !user?.isActive || !user.hasLicenseSeat || !membership) {
    return { ...base, valid: false, reason: 'user_invalid' };
  }
  if (!device) return { ...base, valid: false, reason: 'device_revoked' };
  if (!license || license.status !== 'active' || license.expiresAt <= new Date()) {
    return { ...base, valid: false, reason: 'license_invalid' };
  }

  if (subscription) {
    const activeStatus = subscription.status === 'active' || subscription.status === 'trialing';
    const canceledButPaid = subscription.status === 'canceled' &&
      subscription.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd > new Date();
    if ((!activeStatus && !canceledButPaid) || subscription.currentPeriodEnd <= new Date()) {
      return { ...base, valid: false, reason: 'subscription_invalid' };
    }
  }

  const activeDevices = await Device.countDocuments({ companyId, userId, status: 'active' });
  if (activeDevices > (license.maxDevicesPerUser || 2)) {
    return { ...base, valid: false, reason: 'device_revoked' };
  }

  return { ...base, valid: true };
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizePairingCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-F0-9]{20}$/.test(normalized) ? normalized : null;
}
