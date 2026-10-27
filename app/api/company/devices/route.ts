import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { authenticateRequest, enforceTenant } from '@/lib/auth';

export async function GET(req: NextRequest) {
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

    const devices = await Device.find({ companyId })
      .populate('userId', 'name email')
      .sort({ lastHeartbeatAt: -1 });

    return NextResponse.json({
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
