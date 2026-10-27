import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { Invitation } from '@/models/Invitation';
import { Company } from '@/models/Company';
import { User } from '@/models/User';
import { Membership } from '@/models/Membership';
import { signAccessToken, signRefreshToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
    }

    const invitation = await Invitation.findOne({
      token,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation link is invalid or has expired.' }, { status: 400 });
    }

    const company = await Company.findById(invitation.companyId);
    if (!company || company.status !== 'active') {
      return NextResponse.json({ error: 'Associated company workspace is inactive.' }, { status: 400 });
    }

    let user = await User.findOne({ email: invitation.email });
    const passwordHash = await bcrypt.hash(password, 12);

    if (!user) {
      user = await User.create({
        email: invitation.email,
        name: invitation.name,
        passwordHash,
        role: invitation.role,
        companyId: company._id,
        isActive: true,
        hasLicenseSeat: false,
      });
    } else {
      user.passwordHash = passwordHash;
      user.companyId = company._id as any;
      user.role = invitation.role;
      user.isActive = true;
      await user.save();
    }

    await Membership.findOneAndUpdate(
      { userId: user._id, companyId: company._id },
      { role: invitation.role, status: 'active', hasSeat: false },
      { upsert: true }
    );

    invitation.status = 'accepted';
    await invitation.save();

    const accessToken = signAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: company._id.toString(),
    });

    const refreshToken = signRefreshToken({ id: user._id.toString() });

    return NextResponse.json({
      message: 'Invitation accepted successfully.',
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: company._id.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invitation acceptance failed' }, { status: 500 });
  }
}
