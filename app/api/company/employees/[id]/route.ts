import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Membership } from '@/models/Membership';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { releaseSeatForUser } from '@/lib/licensing';
import { logAuditEvent } from '@/lib/audit';

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
    const targetUserId = params.id;
    const body = await req.json();
    const { isActive, hasLicenseSeat } = body;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser || targetUser.companyId?.toString() !== companyId) {
      return NextResponse.json({ error: 'Employee not found in your company workspace' }, { status: 404 });
    }

    if (targetUser.role === 'company_admin' && targetUser._id.toString() === auth.user.id) {
      if (isActive === false) {
        return NextResponse.json({ error: 'You cannot deactivate your own administrator account.' }, { status: 400 });
      }
    }

    if (isActive !== undefined) {
      targetUser.isActive = isActive;
      if (!isActive && targetUser.hasLicenseSeat) {
        await releaseSeatForUser(companyId, targetUser._id, auth.user);
      }
    }

    if (hasLicenseSeat === false && targetUser.hasLicenseSeat) {
      await releaseSeatForUser(companyId, targetUser._id, auth.user);
    }

    await targetUser.save();

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'EMPLOYEE_STATUS_UPDATED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      details: { isActive, hasLicenseSeat },
      req,
    });

    return NextResponse.json({
      message: 'Employee updated successfully',
      employee: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        isActive: targetUser.isActive,
        hasLicenseSeat: targetUser.hasLicenseSeat,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
    const targetUserId = params.id;

    if (targetUserId === auth.user.id) {
      return NextResponse.json({ error: 'You cannot remove your own administrator account.' }, { status: 400 });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser || targetUser.companyId?.toString() !== companyId) {
      return NextResponse.json({ error: 'Employee not found in this company' }, { status: 404 });
    }

    if (targetUser.hasLicenseSeat) {
      await releaseSeatForUser(companyId, targetUser._id, auth.user);
    }

    await Membership.deleteOne({ companyId, userId: targetUser._id });
    targetUser.isActive = false;
    targetUser.companyId = undefined;
    await targetUser.save();

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'EMPLOYEE_REMOVED',
      entityType: 'User',
      entityId: targetUserId,
      details: { email: targetUser.email },
      req,
    });

    return NextResponse.json({ message: 'Employee successfully removed and seat released.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
