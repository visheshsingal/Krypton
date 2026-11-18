import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { Company } from '@/models/Company';
import { Device } from '@/models/Device';
import { License } from '@/models/License';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { logAuditEvent } from '@/lib/audit';

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

    const existingDevice = await Device.findOne({ companyId: auth.user.companyId, deviceId });
    if (existingDevice) {
      if (existingDevice.userId.toString() !== auth.user.id) {
        return NextResponse.json({ error: 'This device is registered to another employee.' }, { status: 409 });
      }
      if (existingDevice.status === 'revoked') {
        return NextResponse.json({ error: 'This device was revoked by your administrator.' }, { status: 403 });
      }
      existingDevice.deviceName = deviceName;
      existingDevice.platform = 'android';
      existingDevice.osVersion = osVersion;
      existingDevice.appVersion = appVersion;
      existingDevice.lastHeartbeatAt = new Date();
      await existingDevice.save();
    } else {
      const activeDeviceCount = await Device.countDocuments({
        companyId: auth.user.companyId,
        userId: auth.user.id,
        status: 'active',
      });
      const maxDevices = Math.max(1, license.maxDevicesPerUser || 2);
      if (activeDeviceCount >= maxDevices) {
        return NextResponse.json({
          error: `Maximum active devices (${maxDevices}) reached. Ask your administrator to revoke an unused device.`,
        }, { status: 403 });
      }

      await Device.create({
        companyId: auth.user.companyId,
        userId: auth.user.id,
        deviceId,
        deviceName,
        platform: 'android',
        osVersion,
        appVersion,
        status: 'active',
        lastHeartbeatAt: new Date(),
        activatedAt: new Date(),
      });
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
      offlineGraceHours: license.offlineGraceHours || 72,
    });
  } catch (error) {
    console.error('[MobileActivation] Could not activate Android device:', error);
    return NextResponse.json({ error: 'Could not activate this Android device.' }, { status: 500 });
  }
}
