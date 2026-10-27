import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { signAccessToken, signRefreshToken } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email/username and password are required.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact your company administrator.' },
        { status: 403 }
      );
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    let companyData: any = null;
    let licenseData: any = null;
    if (user.companyId) {
      companyData = await Company.findById(user.companyId);
      if (!companyData || companyData.status !== 'active') {
        return NextResponse.json({ error: 'Company workspace is inactive.' }, { status: 403 });
      }
      licenseData = await License.findOne({ companyId: user.companyId });
    }

    const accessToken = signAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : undefined,
    });

    const refreshToken = signRefreshToken({ id: user._id.toString() });
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7);

    user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt > new Date()).slice(-4);
    user.refreshTokens.push({
      tokenHash: refreshTokenHash,
      createdAt: new Date(),
      expiresAt: refreshExpiresAt,
    });
    await user.save();

    await logAuditEvent({
      companyId: user.companyId,
      actorId: user._id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user._id.toString(),
      req,
    });

    const response = NextResponse.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId ? user.companyId.toString() : undefined,
        hasLicenseSeat: user.hasLicenseSeat,
      },
      company: companyData
        ? {
            id: companyData._id.toString(),
            name: companyData.name,
            slug: companyData.slug,
            plan: companyData.plan,
            status: companyData.status,
          }
        : undefined,
      license: licenseData
        ? {
            licenseKey: licenseData.licenseKey,
            seatLimit: licenseData.seatLimit,
            occupiedSeats: licenseData.occupiedSeats,
            availableSeats: Math.max(0, licenseData.seatLimit - licenseData.occupiedSeats),
            status: licenseData.status,
            expiresAt: licenseData.expiresAt,
          }
        : undefined,
    });

    // Also set httpOnly cookie for web sessions
    response.cookies.set('krypton_token', accessToken, {
      httpOnly: false, // Accessible to front-end auth client
      path: '/',
      maxAge: 15 * 60,
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Login failed' }, { status: 500 });
  }
}
