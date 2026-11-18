import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { Company } from '@/models/Company';
import { Device } from '@/models/Device';
import { License } from '@/models/License';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { logAuditEvent } from '@/lib/audit';
import {
  calculateCompanyDeviceSeats,
  getSeatsForDeviceCount,
  syncCompanyDeviceSeats,
  withDeviceSeatLock,
} from '@/lib/device-seats';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user?.companyId) {
      return NextResponse.json({ error: auth.error || 'A company account is required.' }, { status: auth.status || 403 });
    }

    const body = await req.json();
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 100) : '';
    const osVersion = typeof body.osVersion === 'string' ? body.osVersion.trim().slice(0, 100) : '';
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim().slice(0, 32) : '';
    if (!/^[a-f0-9-]{36}$/i.test(deviceId) || !deviceName || !osVersion || !appVersion) {
      return NextResponse.json({ error: 'Valid Android device information is required.' }, { status: 400 });
    }

    await connectDB();
    const [company, license] = await Promise.all([
      Company.findById(auth.user.companyId).select('status'),
      License.findOne({ companyId: auth.user.companyId }),
    ]);
    if (!company || company.status !== 'active') {
      return NextResponse.json({ error: 'Company workspace is inactive.' }, { status: 403 });
    }
    if (!license || license.status !== 'active' || license.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Company license is inactive or expired.' }, { status: 403 });
    }

    const activation = await withDeviceSeatLock(license._id, async (lockedLicense) => {
      const existingDevice = await Device.findOne({
        companyId: auth.user!.companyId,
        deviceId,
      });
      if (existingDevice && existingDevice.userId.toString() !== auth.user!.id) {
        return { error: 'This device is registered to another employee.', status: 409 };
      }
      if (existingDevice?.status === 'revoked') {
        return { error: 'This device was revoked by your administrator.', status: 403 };
      }
      const activeDeviceCount = await Device.countDocuments({
        companyId: auth.user!.companyId,
        userId: auth.user!.id,
        status: 'active',
      });
      const occupiedSeats = await calculateCompanyDeviceSeats(auth.user!.companyId!);
      const nextOccupiedSeats = occupiedSeats + (
        existingDevice?.status === 'active'
          ? 0
          : getSeatsForDeviceCount(activeDeviceCount + 1) - getSeatsForDeviceCount(activeDeviceCount)
      );
      if (nextOccupiedSeats > lockedLicense.seatLimit) {
        return {
          error: `No license capacity available. Each two active devices use one license seat; ${lockedLicense.seatLimit} seats are available in total.`,
          status: 403,
        };
      }

      const device = existingDevice || new Device({
        companyId: auth.user!.companyId,
        userId: auth.user!.id,
        deviceId,
        deviceName,
        platform: 'android',
        osVersion,
        appVersion,
        status: 'active',
      });
      device.deviceName = deviceName;
      device.platform = 'android';
      device.osVersion = osVersion;
      device.appVersion = appVersion;
      device.status = 'active';
      device.lastHeartbeatAt = new Date();
      await device.save();
      lockedLicense.occupiedSeats = await syncCompanyDeviceSeats(auth.user!.companyId!);
      return { occupiedSeats: lockedLicense.occupiedSeats, status: 200 };
    });
    if (!activation) {
      return NextResponse.json({ error: 'Device license allocation is busy. Please retry activation.' }, { status: 409 });
    }
    if ('error' in activation) {
      return NextResponse.json({ error: activation.error }, { status: activation.status });
    }

    const policy = await SecurityPolicy.findOne({ companyId: auth.user.companyId }).lean();
    await logAuditEvent({
      companyId: auth.user.companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'ANDROID_DEVICE_ACTIVATED',
      entityType: 'Device',
      entityId: deviceId,
      details: { deviceId, deviceName, platform: 'android', appVersion },
      req,
    });

    return NextResponse.json({
      success: true,
      deviceId,
      policy,
      occupiedSeats: activation.occupiedSeats,
      offlineGraceHours: license.offlineGraceHours || 72,
    });
  } catch (error) {
    console.error('[MobileActivation] Could not activate Android device:', error);
    return NextResponse.json({ error: 'Could not activate this Android device.' }, { status: 500 });
  }
}
