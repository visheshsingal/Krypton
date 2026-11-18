import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : '';
    if (!refreshToken || refreshToken.length > 4096) {
      return NextResponse.json({ error: 'A valid refresh token is required.' }, { status: 400 });
    }

    await connectDB();
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await User.updateOne(
      { 'refreshTokens.tokenHash': tokenHash },
      { $pull: { refreshTokens: { tokenHash } } },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MobileLogout] Could not revoke Android refresh token:', error);
    return NextResponse.json({ error: 'Could not complete Android sign-out.' }, { status: 500 });
  }
}
