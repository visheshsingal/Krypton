import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { License } from '@/models/License';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { syncCompanyDeviceSeats, withDeviceSeatLock } from '@/lib/device-seats';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const explicitCompanyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('companyId');
    const tenant = enforceTenant(auth.user, explicitCompanyId);
    if (tenant.error || !tenant.companyId) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status || 403 });
    }

    await connectDB();
    const companyId = tenant.companyId;
    const deviceId = params.id;

    const device = await Device.findOne({
      companyId,
      $or: [
        { _id: mongoose.isValidObjectId(deviceId) ? deviceId : undefined },
        { deviceId },
      ].filter(Boolean),
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const license = await License.findOne({ companyId });
    const revokeDevice = async () => {
      device.status = 'revoked';
      device.revokedAt = new Date();
      device.usbMonitoringConsentAt = undefined;
      device.usbMonitoringConsentVersion = undefined;
      await device.save();
      await syncCompanyDeviceSeats(companyId);
    };
    if (license) {
      const revoked = await withDeviceSeatLock(license._id, async () => {
        await revokeDevice();
        return true;
      });
      if (!revoked) {
        return NextResponse.json({ error: 'Device license allocation is busy. Please retry revoking this device.' }, { status: 409 });
      }
    } else {
      await revokeDevice();
    }
    await BrowserExtensionSession.updateMany(
      { companyId, desktopDeviceId: device.deviceId, status: { $in: ['pending', 'active'] } },
      {
        $set: { status: 'revoked', revokedAt: new Date() },
        $unset: { sessionTokenHash: 1, pairingCodeHash: 1, browserInstallationId: 1 },
      }
    );

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'DEVICE_REVOKED',
      entityType: 'Device',
      entityId: device.deviceId,
      details: { deviceName: device.deviceName, deviceId: device.deviceId },
      req,
    });

    return NextResponse.json({ message: `Device ${device.deviceName} has been revoked.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const explicitCompanyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('companyId');
    const tenant = enforceTenant(auth.user, explicitCompanyId);
    if (tenant.error || !tenant.companyId) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status || 403 });
    }

    await connectDB();
    const companyId = tenant.companyId;
    const deviceId = params.id;

    const device = await Device.findOne({
      companyId,
      $or: [
        { _id: mongoose.isValidObjectId(deviceId) ? deviceId : undefined },
        { deviceId },
      ].filter(Boolean),
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const body = await req.json();

    if (body.ownership && ['company', 'personal'].includes(body.ownership)) {
      device.ownership = body.ownership;
    }

    if (body.schedule && typeof body.schedule === 'object') {
      device.schedule = {
        enabled: Boolean(body.schedule.enabled),
        workDays: Array.isArray(body.schedule.workDays) ? body.schedule.workDays : [1, 2, 3, 4, 5],
        startTime: body.schedule.startTime || '09:00',
        endTime: body.schedule.endTime || '18:00',
        timezone: body.schedule.timezone || 'Asia/Kolkata',
      };
    }

    await device.save();

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'DEVICE_SCHEDULE_UPDATED',
      entityType: 'Device',
      entityId: device.deviceId,
      details: {
        deviceName: device.deviceName,
        ownership: device.ownership,
        schedule: device.schedule,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      device: {
        id: device._id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        ownership: device.ownership,
        schedule: device.schedule,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
