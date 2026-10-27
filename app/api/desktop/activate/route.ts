import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { activateDesktopDevice } from '@/lib/licensing';
import { signAccessToken, signRefreshToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const {
      licenseKey,
      email,
      password,
      deviceId,
      deviceName,
      platform = 'win32',
      osVersion = 'Windows 11',
      appVersion = '1.0.0',
    } = body;

    if (!licenseKey || !email || !password || !deviceId) {
      return NextResponse.json(
        { error: 'License key, employee email, password, and device ID are required.' },
        { status: 400 }
      );
    }

    const result = await activateDesktopDevice({
      licenseKey,
      email,
      password,
      deviceId,
      deviceName,
      platform,
      osVersion,
      appVersion,
    });

    if (!result.success || !result.user || !result.license || !result.device) {
      return NextResponse.json({ error: result.error || 'Activation denied' }, { status: result.statusCode || 400 });
    }

    const token = signAccessToken({
      id: result.user._id.toString(),
      email: result.user.email,
      role: result.user.role,
      companyId: result.license.companyId.toString(),
    });

    const refreshToken = signRefreshToken({ id: result.user._id.toString() });
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

    result.user.refreshTokens.push({
      tokenHash: refreshTokenHash,
      deviceId,
      createdAt: new Date(),
      expiresAt: refreshExpiresAt,
    });
    await result.user.save();

    return NextResponse.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: result.user._id.toString(),
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        companyId: result.license.companyId.toString(),
      },
      license: {
        id: result.license._id.toString(),
        companyId: result.license.companyId.toString(),
        licenseKey: result.license.licenseKey,
        plan: result.license.plan,
        seatLimit: result.license.seatLimit,
        occupiedSeats: result.license.occupiedSeats,
        status: result.license.status,
        maxDevicesPerUser: result.license.maxDevicesPerUser,
        offlineGraceHours: result.license.offlineGraceHours,
        expiresAt: result.license.expiresAt.toISOString(),
      },
      device: {
        id: result.device._id.toString(),
        deviceId: result.device.deviceId,
        deviceName: result.device.deviceName,
        status: result.device.status,
        activatedAt: result.device.activatedAt.toISOString(),
      },
      policy: result.policy,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
