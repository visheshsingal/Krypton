import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { Membership } from '@/models/Membership';
import { Invitation } from '@/models/Invitation';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { User } from '@/models/User';
import { Device } from '@/models/Device';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { sendInvitationEmail } from '@/lib/email';
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

    const memberships = await Membership.find({ companyId })
      .populate('userId', 'name email role isActive hasLicenseSeat createdAt')
      .sort({ createdAt: -1 });

    const invitations = await Invitation.find({
      companyId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    const devices = await Device.find({ companyId, status: 'active' });
    const deviceCountMap: Record<string, number> = {};
    for (const d of devices) {
      const uid = d.userId.toString();
      deviceCountMap[uid] = (deviceCountMap[uid] || 0) + 1;
    }

    const employees = memberships.map((m) => {
      const u: any = m.userId;
      return {
        membershipId: m._id,
        userId: u?._id,
        name: u?.name || 'Unknown',
        email: u?.email || '',
        role: m.role,
        status: m.status,
        hasSeat: u?.hasLicenseSeat || false,
        isActive: u?.isActive || false,
        deviceCount: u ? deviceCountMap[u._id.toString()] || 0 : 0,
        joinedAt: m.createdAt,
      };
    });

    return NextResponse.json({
      employees,
      pendingInvitations: invitations.map((inv) => ({
        id: inv._id,
        name: inv.name,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    const { email, name, assignLicense = true } = await req.json();

    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const company = await Company.findById(companyId);
    const license = await License.findOne({ companyId });

    if (!company || !license) {
      return NextResponse.json({ error: 'Company or license not found' }, { status: 404 });
    }

    // Check if user already exists in membership
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      const existingMembership = await Membership.findOne({ companyId, userId: existingUser._id });
      if (existingMembership) {
        return NextResponse.json({ error: 'This user is already a member of your company workspace.' }, { status: 400 });
      }
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const existingInvitation = await Invitation.findOne({
      companyId,
      email: normalizedEmail,
      status: 'pending',
    });

    let invitation;
    if (existingInvitation) {
      existingInvitation.token = inviteToken;
      existingInvitation.expiresAt = expiresAt;
      invitation = await existingInvitation.save();
    } else {
      invitation = await Invitation.create({
        companyId,
        email: normalizedEmail,
        name: name.trim(),
        role: 'employee',
        token: inviteToken,
        assignLicense,
        expiresAt,
        invitedBy: auth.user.id,
      });
    }

    await sendInvitationEmail(
      normalizedEmail,
      name.trim(),
      company.name,
      inviteToken,
      license.licenseKey
    );

    await logAuditEvent({
      companyId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      action: 'EMPLOYEE_INVITED',
      entityType: 'Invitation',
      entityId: invitation._id.toString(),
      details: { email: normalizedEmail, name, assignLicense },
      req,
    });

    return NextResponse.json(
      {
        message: `Invitation successfully dispatched to ${normalizedEmail}`,
        invitation: {
          id: invitation._id,
          email: invitation.email,
          name: invitation.name,
          expiresAt: invitation.expiresAt,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
