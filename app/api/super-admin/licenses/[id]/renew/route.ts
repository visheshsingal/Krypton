import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { License } from '@/models/License';
import { authenticateRequest } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    const { months = 12 } = await req.json();

    const license = await License.findById(licenseId);
    if (!license) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 });
    }

    const newExpiry = new Date(Math.max(new Date().getTime(), license.expiresAt.getTime()));
    newExpiry.setMonth(newExpiry.getMonth() + parseInt(String(months), 10));

    license.expiresAt = newExpiry;
    license.status = 'active';
    await license.save();

    await logAuditEvent({
      companyId: license.companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'SUPERADMIN_LICENSE_RENEWED',
      entityType: 'License',
      entityId: license._id.toString(),
      details: { months, newExpiresAt: newExpiry },
      req,
    });

    return NextResponse.json({ message: 'License renewed successfully', license });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
