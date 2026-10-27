import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
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
    await device.save();

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
