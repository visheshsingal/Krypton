import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

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

    device.status = 'revoked';
    device.revokedAt = new Date();
    device.usbMonitoringConsentAt = undefined;
    device.usbMonitoringConsentVersion = undefined;
    await device.save();
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
