import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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
    const { isActive, hasLicenseSeat, name, phone, department, designation, systemId } = body;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser || targetUser.companyId?.toString() !== companyId) {
      return NextResponse.json({ error: 'Employee not found in your company workspace' }, { status: 404 });
    }

    if (targetUser.role === 'company_admin' && targetUser._id.toString() === auth.user.id) {
      if (isActive === false) {
        return NextResponse.json({ error: 'You cannot deactivate your own administrator account.' }, { status: 400 });
      }
    }

    if (name !== undefined && typeof name === 'string' && name.trim()) {
      targetUser.name = name.trim();
    }
    if (phone !== undefined) {
      targetUser.phone = typeof phone === 'string' ? phone.trim() : '';
    }
    if (department !== undefined) {
      targetUser.department = typeof department === 'string' ? department.trim() : '';
    }
    if (designation !== undefined) {
      targetUser.designation = typeof designation === 'string' ? designation.trim() : '';
    }
    if (systemId !== undefined) {
      targetUser.systemId = typeof systemId === 'string' ? systemId.trim() : '';
    }

    if (isActive !== undefined) {
      targetUser.isActive = isActive;
      if (!isActive && targetUser.hasLicenseSeat) {
        await releaseSeatForUser(companyId, targetUser._id, auth.user);
        targetUser.hasLicenseSeat = false;
      }
    }

    if (hasLicenseSeat === false && targetUser.hasLicenseSeat) {
      await releaseSeatForUser(companyId, targetUser._id, auth.user);
      targetUser.hasLicenseSeat = false;
    } else if (hasLicenseSeat === true) {
      if (targetUser.role !== 'employee') {
        return NextResponse.json({ error: 'License seats can only be assigned to employees.' }, { status: 400 });
      }
      const password = typeof body.password === 'string' ? body.password : '';
      if (
        password.length < 12 ||
        password.length > 128 ||
        password.toLowerCase() === targetUser.email.toLowerCase()
      ) {
        return NextResponse.json({
          error: 'Set a unique password with at least 12 characters. It cannot be the employee email address.',
        }, { status: 400 });
      }

      const membership = await Membership.findOne({ companyId, userId: targetUser._id, status: 'active' });
      if (!membership) {
        return NextResponse.json({ error: 'An active company membership is required before assigning a seat.' }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      if (targetUser.hasLicenseSeat) {
        targetUser.passwordHash = passwordHash;
        membership.hasSeat = true;
        await Promise.all([targetUser.save(), membership.save()]);
      } else {
        const { License } = await import('@/models/License');
        const license = await License.findOne({ companyId });
        if (!license || license.status !== 'active' || license.expiresAt <= new Date()) {
          return NextResponse.json({ error: 'The company license is unavailable or expired.' }, { status: 403 });
        }
        const allocatedLicense = await License.findOneAndUpdate(
          {
            _id: license._id,
            status: 'active',
            expiresAt: { $gt: new Date() },
            $expr: { $lt: ['$occupiedSeats', '$seatLimit'] },
          },
          { $inc: { occupiedSeats: 1 } },
          { new: true },
        );
        if (!allocatedLicense) {
          return NextResponse.json({ error: 'No available license seats remaining. Please release an unused seat.' }, { status: 400 });
        }

        const claimedUser = await User.findOneAndUpdate(
          { _id: targetUser._id, isActive: true, hasLicenseSeat: { $ne: true } },
          { $set: { hasLicenseSeat: true, passwordHash } },
          { new: true },
        );
        if (!claimedUser) {
          await License.updateOne({ _id: allocatedLicense._id, occupiedSeats: { $gt: 0 } }, { $inc: { occupiedSeats: -1 } });
          return NextResponse.json({ error: 'Employee seat status changed. Refresh the directory and try again.' }, { status: 409 });
        }
        try {
          membership.hasSeat = true;
          await membership.save();
          targetUser.hasLicenseSeat = true;
          targetUser.passwordHash = passwordHash;
        } catch (error) {
          await Promise.all([
            User.updateOne(
              { _id: targetUser._id, hasLicenseSeat: true },
              { $set: { hasLicenseSeat: false, passwordHash: targetUser.passwordHash } },
            ),
            License.updateOne({ _id: allocatedLicense._id, occupiedSeats: { $gt: 0 } }, { $inc: { occupiedSeats: -1 } }),
          ]);
          throw error;
        }
      }
    }

    if (hasLicenseSeat !== true || targetUser.hasLicenseSeat === false) {
      await targetUser.save();
    }

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'EMPLOYEE_STATUS_UPDATED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      details: { isActive, hasLicenseSeat, name, phone, department, designation, systemId },
      req,
    });

    return NextResponse.json({
      message: 'Employee updated successfully',
      employee: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone,
        department: targetUser.department,
        designation: targetUser.designation,
        systemId: targetUser.systemId,
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
