import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { Device } from '@/models/Device';
import { License } from '@/models/License';
import { SecurityPolicy } from '@/models/SecurityPolicy';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user?.companyId) {
      return NextResponse.json({ error: auth.error || 'Unauthenticated Android device.' }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim().slice(0, 32) : '';
    if (!/^[a-f0-9-]{36}$/i.test(deviceId)) {
      return NextResponse.json({ error: 'A valid Android device ID is required.' }, { status: 400 });
    }

    await connectDB();
    const device = await Device.findOne({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      deviceId,
      platform: 'android',
    });
    if (!device || device.status === 'revoked') {
      return NextResponse.json({
        valid: false,
        status: 'revoked',
        message: 'This Android device was revoked or is not registered.',
      }, { status: 403 });
    }

    const [company, license, policy] = await Promise.all([
      Company.findById(auth.user.companyId).select('status'),
      License.findOne({ companyId: auth.user.companyId }),
      SecurityPolicy.findOne({ companyId: auth.user.companyId }).lean(),
    ]);
    if (!company || company.status !== 'active' || !license || license.status !== 'active' || license.expiresAt <= new Date()) {
      return NextResponse.json({
        valid: false,
        status: 'inactive',
        message: 'The company workspace or license is inactive.',
      }, { status: 403 });
    }

    device.lastHeartbeatAt = new Date();
    if (appVersion) device.appVersion = appVersion;
    await device.save();

    return NextResponse.json({
      valid: true,
      status: 'active',
      policy,
      offlineGraceHours: license.offlineGraceHours || 72,
      nextCheckInMinutes: 5,
    });
  } catch (error) {
    console.error('[MobileHeartbeat] Could not validate Android device:', error);
    return NextResponse.json({ error: 'Could not validate this Android device.' }, { status: 500 });
  }
}
