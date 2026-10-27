import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Company } from '@/models/Company';
import { License } from '@/models/License';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    await connectDB();
    const user = await User.findById(auth.user.id).select('-passwordHash -refreshTokens');
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let companyData: any = null;
    let licenseData: any = null;

    if (user.companyId) {
      companyData = await Company.findById(user.companyId);
      licenseData = await License.findOne({ companyId: user.companyId });
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId ? user.companyId.toString() : undefined,
        hasLicenseSeat: user.hasLicenseSeat,
        isActive: user.isActive,
        createdAt: user.createdAt,
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
            id: licenseData._id.toString(),
            licenseKey: licenseData.licenseKey,
            plan: licenseData.plan,
            seatLimit: licenseData.seatLimit,
            occupiedSeats: licenseData.occupiedSeats,
            availableSeats: Math.max(0, licenseData.seatLimit - licenseData.occupiedSeats),
            status: licenseData.status,
            expiresAt: licenseData.expiresAt,
          }
        : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch user' }, { status: 500 });
  }
}
