import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { authenticateRequest } from '@/lib/auth';
import { generateLicenseKey } from '@/lib/licensing';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    if (auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    await connectDB();
    const body = await req.json();
    const { companyId, seatLimit = 10, maxDevicesPerUser = 2, offlineGraceHours = 72, expiresAt } = body;
    const parsedSeatLimit = Number(seatLimit);
    if (!Number.isInteger(parsedSeatLimit) || parsedSeatLimit < 1 || parsedSeatLimit > 100000) {
      return NextResponse.json({ error: 'License count must be between 1 and 100000.' }, { status: 400 });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const licenseKey = generateLicenseKey();
    const expiry = expiresAt ? new Date(expiresAt) : new Date();
    if (!expiresAt) {
      expiry.setFullYear(expiry.getFullYear() + 1);
    }

    const license = await License.create({
      companyId: company._id,
      licenseKey,
      plan: 'starter',
      seatLimit: parsedSeatLimit,
      occupiedSeats: 0,
      status: 'active',
      maxDevicesPerUser: parseInt(String(maxDevicesPerUser), 10) || 2,
      offlineGraceHours: parseInt(String(offlineGraceHours), 10) || 72,
      expiresAt: expiry,
      createdBy: auth.user.id,
    });

    await logAuditEvent({
      companyId: company._id,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'SUPERADMIN_LICENSE_CREATED',
      entityType: 'License',
      entityId: license._id.toString(),
      details: { licenseKey, seatLimit: license.seatLimit },
      req,
    });

    return NextResponse.json({ message: 'License created successfully', license }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
