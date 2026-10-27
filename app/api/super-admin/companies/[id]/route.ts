import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { authenticateRequest } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { Device } from '@/models/Device';
import { DetectionRule } from '@/models/DetectionRule';
import { Invitation } from '@/models/Invitation';
import { License } from '@/models/License';
import { Membership } from '@/models/Membership';
import { SecurityEvent } from '@/models/SecurityEvent';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { User } from '@/models/User';
import { logAuditEvent } from '@/lib/audit';

async function authorizeSuperAdmin(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error || !auth.user) {
    return { error: NextResponse.json({ error: auth.error }, { status: auth.status || 401 }) };
  }
  if (auth.user.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Super Admin access required' }, { status: 403 }) };
  }
  return { user: auth.user };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authorization = await authorizeSuperAdmin(req);
    if (authorization.error) return authorization.error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid company ID.' }, { status: 400 });
    }

    await connectDB();
    const company = await Company.findById(params.id);
    if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) {
        return NextResponse.json({ error: 'Company status must be active or suspended.' }, { status: 400 });
      }
      company.status = body.status;
      updates.status = body.status;
    }

    if (body.seatLimit !== undefined) {
      const seatLimit = Number(body.seatLimit);
      if (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 100000) {
        return NextResponse.json({ error: 'License count must be between 1 and 100000.' }, { status: 400 });
      }
      const license = await License.findOne({ companyId: company._id, status: { $ne: 'revoked' } }).sort({
        createdAt: -1,
      });
      if (!license) return NextResponse.json({ error: 'Company has no active license to update.' }, { status: 404 });
      if (seatLimit < license.occupiedSeats) {
        return NextResponse.json(
          { error: `License count cannot be lower than ${license.occupiedSeats} currently occupied seats.` },
          { status: 409 }
        );
      }
      license.seatLimit = seatLimit;
      await license.save();
      updates.seatLimit = seatLimit;
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No supported company or license changes provided.' }, { status: 400 });
    }

    await company.save();
    await logAuditEvent({
      companyId: company._id,
      actorId: authorization.user!.id,
      actorEmail: authorization.user!.email,
      actorRole: authorization.user!.role,
      action: 'SUPERADMIN_COMPANY_UPDATED',
      entityType: 'Company',
      entityId: company._id.toString(),
      details: updates,
      req,
    });

    return NextResponse.json({ message: 'Company updated successfully.', company: { id: company.id, status: company.status } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not update company.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authorization = await authorizeSuperAdmin(req);
    if (authorization.error) return authorization.error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid company ID.' }, { status: 400 });
    }

    await connectDB();
    const company = await Company.findById(params.id);
    if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

    const companyId = company._id;
    await logAuditEvent({
      companyId,
      actorId: authorization.user!.id,
      actorEmail: authorization.user!.email,
      actorRole: authorization.user!.role,
      action: 'SUPERADMIN_COMPANY_DELETED',
      entityType: 'Company',
      entityId: companyId.toString(),
      details: { companyName: company.name },
      req,
    });

    await Promise.all([
      User.deleteMany({ companyId }),
      Membership.deleteMany({ companyId }),
      License.deleteMany({ companyId }),
      Device.deleteMany({ companyId }),
      SecurityEvent.deleteMany({ companyId }),
      SecurityPolicy.deleteMany({ companyId }),
      Invitation.deleteMany({ companyId }),
      DetectionRule.deleteMany({ companyId }),
    ]);
    await Company.deleteOne({ _id: companyId });

    return NextResponse.json({ message: 'Company and its associated workspace data were deleted.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Could not delete company.' }, { status: 500 });
  }
}
