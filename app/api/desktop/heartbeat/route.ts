import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { License } from '@/models/License';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { Company } from '@/models/Company';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user || !auth.user.companyId) {
      return NextResponse.json({ error: 'Unauthenticated device' }, { status: 401 });
    }

    await connectDB();
    const { deviceId, appVersion } = await req.json();

    const device = await Device.findOne({ companyId: auth.user.companyId, deviceId });
    if (!device || device.status === 'revoked') {
      return NextResponse.json(
        {
          valid: false,
          status: 'revoked',
          message: 'This device registration has been revoked by an administrator.',
        },
        { status: 403 }
      );
    }

    const [company, license] = await Promise.all([
      Company.findById(auth.user.companyId),
      License.findOne({ companyId: auth.user.companyId }),
    ]);
    if (!company || company.status !== 'active' || !license || license.status !== 'active' || new Date() > license.expiresAt) {
      return NextResponse.json(
        {
          valid: false,
          status: company?.status === 'suspended' ? 'suspended' : license?.status || 'expired',
          message:
            company?.status !== 'active'
              ? 'Company workspace is inactive.'
              : 'Company license is inactive or expired.',
        },
        { status: 403 }
      );
    }

    device.lastHeartbeatAt = new Date();
    if (appVersion) device.appVersion = appVersion;
    await device.save();

    const policy = await SecurityPolicy.findOne({ companyId: auth.user.companyId });

    return NextResponse.json({
      valid: true,
      status: 'active',
      policy,
      offlineGraceHours: license.offlineGraceHours || 72,
      nextCheckInMinutes: 60,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
