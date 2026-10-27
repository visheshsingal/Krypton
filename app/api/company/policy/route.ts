import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

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

    let policy = await SecurityPolicy.findOne({ companyId });
    if (!policy) {
      policy = await SecurityPolicy.create({
        companyId,
        blockCriticalRisk: true,
        blockHighRisk: true,
        warnMediumRisk: true,
        allowLowRisk: true,
        allowEmployeeBypassWarning: true,
        enablePiiDetection: true,
        enableSecretDetection: true,
        enableCustomRules: true,
        maxDevicesPerUser: 2,
        offlineGracePeriodHours: 72,
        fullPromptLoggingEnabled: false,
        customRules: [],
      });
    }

    return NextResponse.json({ policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    const body = await req.json();

    const policy = await SecurityPolicy.findOneAndUpdate(
      { companyId },
      { $set: body },
      { new: true, upsert: true }
    );

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'SECURITY_POLICY_UPDATED',
      entityType: 'SecurityPolicy',
      entityId: policy._id.toString(),
      details: body,
      req,
    });

    return NextResponse.json({ message: 'Security policy updated successfully', policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
