import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { signAccessToken, signRefreshToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { refreshToken: token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Refresh token is required' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const tokenQuery = {
      refreshTokens: {
        $elemMatch: {
          tokenHash,
          expiresAt: { $gt: now },
        },
      },
    };
    const user = await User.findOne({
      ...tokenQuery,
      isActive: true,
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    const newAccessToken = signAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : undefined,
    });

    const newRefreshToken = signRefreshToken({ id: user._id.toString() });
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    const rotatedUser = await User.findOneAndUpdate(
      { _id: user._id, isActive: true, ...tokenQuery },
      {
        $set: {
          'refreshTokens.$[matchingToken].tokenHash': newHash,
          'refreshTokens.$[matchingToken].createdAt': now,
          'refreshTokens.$[matchingToken].expiresAt': newExpiresAt,
        },
      },
      {
        new: true,
        arrayFilters: [
          {
            'matchingToken.tokenHash': tokenHash,
            'matchingToken.expiresAt': { $gt: now },
          },
        ],
      }
    );

    if (!rotatedUser) {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    return NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
  }
}
