import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { User } from '@/models/User';
import { Membership } from '@/models/Membership';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { Device } from '@/models/Device';
import { SecurityEvent } from '@/models/SecurityEvent';
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

    const body = await req.json();
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const adminEmail = typeof body.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const seatLimit = Number(body.seatLimit);

    if (companyName.length < 2 || companyName.length > 100) {
      return NextResponse.json({ error: 'Company name must be between 2 and 100 characters.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return NextResponse.json({ error: 'Enter a valid admin email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Admin password must be at least 8 characters.' }, { status: 400 });
    }
    if (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 100000) {
      return NextResponse.json({ error: 'License count must be a whole number between 1 and 100000.' }, { status: 400 });
    }

    await connectDB();
    if (await User.findOne({ email: adminEmail })) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'workspace';
    let slug = baseSlug;
    let counter = 1;
    while (await Company.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const company = await Company.create({
      name: companyName,
      slug,
      plan: 'starter',
      status: 'active',
      contactEmail: adminEmail,
    });
    const admin = await User.create({
      email: adminEmail,
      passwordHash: await bcrypt.hash(password, 12),
      name: adminEmail.split('@')[0],
      role: 'company_admin',
      companyId: company._id,
      isActive: true,
      hasLicenseSeat: true,
    });
    const licenseKey = generateLicenseKey();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await Promise.all([
      Membership.create({
        userId: admin._id,
        companyId: company._id,
        role: 'company_admin',
        status: 'active',
        hasSeat: true,
      }),
      License.create({
        companyId: company._id,
        licenseKey,
        plan: 'starter',
        seatLimit,
        occupiedSeats: 1,
        status: 'active',
        maxDevicesPerUser: 2,
        offlineGraceHours: 72,
        expiresAt,
        createdBy: auth.user.id,
      }),
      SecurityPolicy.create({ companyId: company._id }),
    ]);

    await logAuditEvent({
      companyId: company._id,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'SUPERADMIN_COMPANY_AND_ADMIN_CREATED',
      entityType: 'Company',
      entityId: company._id.toString(),
      details: { companyName, adminEmail, seatLimit, licenseKey },
      req,
    });

    return NextResponse.json(
      {
        message: 'Company admin and license created successfully.',
        company: { id: company._id.toString(), name: company.name },
        admin: { name: admin.name, email: admin.email },
        license: { licenseKey, seatLimit, expiresAt },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Super Admin company creation failed:', err);
    return NextResponse.json({ error: err.message || 'Could not create company admin.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    if (auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    await connectDB();
    const companies = await Company.find().sort({ createdAt: -1 });
    const companyIds = companies.map((c) => c._id);

    const [licenses, admins, devices, events] = await Promise.all([
      License.find({ companyId: { $in: companyIds } }),
      User.find({ companyId: { $in: companyIds }, role: 'company_admin' }),
      Device.find({ companyId: { $in: companyIds }, status: 'active' }),
      SecurityEvent.aggregate([
        { $match: { companyId: { $in: companyIds } } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } },
      ]),
    ]);

    const licMap = new Map(licenses.map((l) => [l.companyId.toString(), l]));
    const adminMap = new Map(admins.map((a) => [a.companyId!.toString(), a]));
    const eventCountMap = new Map(events.map((e) => [e._id.toString(), e.count]));

    const deviceCountMap: Record<string, number> = {};
    for (const d of devices) {
      const cid = d.companyId.toString();
      deviceCountMap[cid] = (deviceCountMap[cid] || 0) + 1;
    }

    const result = companies.map((c) => {
      const cid = c._id.toString();
      const lic = licMap.get(cid);
      const admin = adminMap.get(cid);

      return {
        id: c._id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        contactEmail: c.contactEmail || admin?.email,
        adminName: admin?.name || 'N/A',
        adminEmail: admin?.email || 'N/A',
        license: lic
          ? {
              id: lic._id,
              key: lic.licenseKey,
              seatLimit: lic.seatLimit,
              occupiedSeats: lic.occupiedSeats,
              availableSeats: Math.max(0, lic.seatLimit - lic.occupiedSeats),
              status: lic.status,
              expiresAt: lic.expiresAt,
              offlineGraceHours: lic.offlineGraceHours,
            }
          : null,
        deviceCount: deviceCountMap[cid] || 0,
        incidentCount: eventCountMap.get(cid) || 0,
        createdAt: c.createdAt,
      };
    });

    return NextResponse.json({ companies: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
