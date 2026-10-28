import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { validateExtensionEntitlement, sha256 } from '@/lib/extension-licensing';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user?.companyId || auth.user.role === 'super_admin') {
      return NextResponse.json({ error: auth.error || 'Company account required.' }, { status: auth.status || 403 });
    }

    await connectDB();
    const value: unknown = await req.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return NextResponse.json({ error: 'A valid device and browser selection are required.' }, { status: 400 });
    }
    const body = value as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const browser = body.browser === 'edge' ? 'edge' : body.browser === 'chrome' ? 'chrome' : null;
    if (!deviceId || deviceId.length > 200 || !browser) {
      return NextResponse.json({ error: 'Valid device ID and browser are required.' }, { status: 400 });
    }

    const entitlement = await validateExtensionEntitlement({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      deviceId,
    });
    if (!entitlement.valid) {
      return NextResponse.json(
        { error: 'This user, subscription, license, or device is not authorized for browser protection.', status: entitlement.reason },
        { status: 403 }
      );
    }

    const code = crypto.randomBytes(10).toString('hex').toUpperCase();
    const now = new Date();
    const recentPairingCount = await BrowserExtensionSession.countDocuments({
      companyId: entitlement.companyId,
      userId: entitlement.userId,
      createdAt: { $gt: new Date(now.getTime() - PAIRING_CODE_TTL_MS) },
    });
    if (recentPairingCount >= 10) {
      return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes and try again.' }, { status: 429 });
    }

    await BrowserExtensionSession.updateMany(
      { companyId: entitlement.companyId, desktopDeviceId: deviceId, status: 'pending' },
      { $set: { status: 'revoked', revokedAt: now }, $unset: { pairingCodeHash: 1 } }
    );
    await BrowserExtensionSession.create({
      companyId: entitlement.companyId,
      userId: entitlement.userId,
      desktopDeviceId: deviceId,
      browser,
      status: 'pending',
      pairingCodeHash: sha256(code),
      pairingExpiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MS),
    });

    return NextResponse.json({
      pairingCode: code,
      expiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MS).toISOString(),
      expiresInSeconds: PAIRING_CODE_TTL_MS / 1000,
    });
  } catch (error) {
    console.error('[ExtensionPairing] Could not create pairing code:', error);
    return NextResponse.json({ error: 'Could not create extension pairing code.' }, { status: 500 });
  }
}
