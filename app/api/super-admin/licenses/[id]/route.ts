import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { License } from '@/models/License';
import { authenticateRequest } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    if (auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    await connectDB();
    const licenseId = params.id;
    const updates = await req.json();

    const license = await License.findById(licenseId);
    if (!license) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    if (updates.seatLimit !== undefined) {
      const seatLimit = Number(updates.seatLimit);
      if (!Number.isInteger(seatLimit) || seatLimit < license.occupiedSeats || seatLimit > 100000) {
        return NextResponse.json(
          { error: `License count must be between ${license.occupiedSeats} and 100000.` },
          { status: 400 }
        );
      }
      license.seatLimit = seatLimit;
    }
    if (updates.status !== undefined) {
      if (!['active', 'suspended', 'expired', 'revoked'].includes(updates.status)) {
        return NextResponse.json({ error: 'Invalid license status.' }, { status: 400 });
      }
      license.status = updates.status;
    }
    if (updates.maxDevicesPerUser !== undefined) license.maxDevicesPerUser = parseInt(String(updates.maxDevicesPerUser), 10);
    if (updates.offlineGraceHours !== undefined) license.offlineGraceHours = parseInt(String(updates.offlineGraceHours), 10);
    if (updates.expiresAt !== undefined) license.expiresAt = new Date(updates.expiresAt);

    await license.save();

    await logAuditEvent({
      companyId: license.companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'SUPERADMIN_LICENSE_UPDATED',
      entityType: 'License',
      entityId: license._id.toString(),
      details: updates,
      req,
    });

    return NextResponse.json({ message: 'License updated successfully', license });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
