import crypto from 'crypto';
import mongoose from 'mongoose';
import { Device } from '@/models/Device';
import { ILicense, License } from '@/models/License';

export const DEVICES_PER_LICENSE_SEAT = 2;

export function getSeatsForDeviceCount(deviceCount: number): number {
  return Math.ceil(Math.max(0, deviceCount) / DEVICES_PER_LICENSE_SEAT);
}

export async function calculateCompanyDeviceSeats(
  companyId: mongoose.Types.ObjectId | string,
): Promise<number> {
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const [result] = await Device.aggregate<{ occupiedSeats: number }>([
    { $match: { companyId: companyObjectId, status: 'active' } },
    { $group: { _id: '$userId', deviceCount: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        occupiedSeats: {
          $sum: { $ceil: { $divide: ['$deviceCount', DEVICES_PER_LICENSE_SEAT] } },
        },
      },
    },
  ]);
  return result?.occupiedSeats ?? 0;
}

export async function syncCompanyDeviceSeats(
  companyId: mongoose.Types.ObjectId | string,
): Promise<number> {
  const occupiedSeats = await calculateCompanyDeviceSeats(companyId);
  await License.updateOne({ companyId }, { $set: { occupiedSeats } });
  return occupiedSeats;
}

export async function withDeviceSeatLock<T>(
  licenseId: mongoose.Types.ObjectId | string,
  operation: (license: ILicense) => Promise<T>,
): Promise<T | null> {
  const lockToken = crypto.randomUUID();
  const now = new Date();
  const license = await License.findOneAndUpdate(
    {
      _id: licenseId,
      $or: [
        { deviceSeatLockUntil: null },
        { deviceSeatLockUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        deviceSeatLockToken: lockToken,
        deviceSeatLockUntil: new Date(now.getTime() + 2 * 60 * 1000),
      },
    },
    { new: true },
  );
  if (!license) return null;

  try {
    return await operation(license);
  } finally {
    await License.updateOne(
      { _id: license._id, deviceSeatLockToken: lockToken },
      { $unset: { deviceSeatLockToken: 1, deviceSeatLockUntil: 1 } },
    );
  }
}
