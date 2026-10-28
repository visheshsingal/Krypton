import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { validateExtensionEntitlement, sha256 } from '@/lib/extension-licensing';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { Device } from '@/models/Device';
import { SecurityPolicy } from '@/models/SecurityPolicy';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const bearer = req.headers.get('authorization');
    const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (token.length < 32 || token.length > 200) {
      return NextResponse.json({ error: 'Extension session is missing or invalid.', status: 'license_invalid' }, { status: 401 });
    }

    const session = await BrowserExtensionSession.findOne({
      sessionTokenHash: sha256(token),
      status: 'active',
      sessionExpiresAt: { $gt: new Date() },
    }).select('+sessionTokenHash');
    if (!session) {
      return NextResponse.json({ error: 'Extension session expired or revoked.', status: 'license_invalid' }, { status: 401 });
    }

    const entitlement = await validateExtensionEntitlement({
      companyId: session.companyId.toString(),
      userId: session.userId.toString(),
      deviceId: session.desktopDeviceId,
    });
    if (!entitlement.valid) {
      return NextResponse.json({
        error: 'Protection is disabled because the account, license, subscription, or device is no longer active.',
        status: entitlement.reason === 'license_invalid' || entitlement.reason === 'subscription_invalid'
          ? 'license_invalid'
          : 'revoked',
      }, { status: 403 });
    }

    session.lastHeartbeatAt = new Date();
    await session.save();
    await Device.updateOne(
      {
        companyId: session.companyId,
        userId: session.userId,
        deviceId: session.desktopDeviceId,
        status: 'active',
      },
      { $set: { lastHeartbeatAt: session.lastHeartbeatAt } }
    );
    const policy = await SecurityPolicy.findOne({ companyId: session.companyId });
    return NextResponse.json({
      status: 'connected',
      protectionActive: true,
      expiresAt: session.sessionExpiresAt?.toISOString(),
      offlineGraceHours: entitlement.license?.offlineGraceHours || 72,
      policy,
    });
  } catch (error) {
    console.error('[ExtensionSession] Heartbeat failed:', error);
    return NextResponse.json({ error: 'Could not validate extension session.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user?.companyId || auth.user.role === 'super_admin') {
      return NextResponse.json({ error: auth.error || 'Company account required.' }, { status: auth.status || 403 });
    }

    await connectDB();
    const value: unknown = await req.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return NextResponse.json({ error: 'Valid device ID is required.' }, { status: 400 });
    }
    const body = value as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!deviceId || deviceId.length > 200) {
      return NextResponse.json({ error: 'Valid device ID is required.' }, { status: 400 });
    }

    await BrowserExtensionSession.updateMany(
      { companyId: auth.user.companyId, userId: auth.user.id, desktopDeviceId: deviceId, status: { $in: ['pending', 'active'] } },
      {
        $set: { status: 'revoked', revokedAt: new Date() },
        $unset: { sessionTokenHash: 1, pairingCodeHash: 1, browserInstallationId: 1 },
      }
    );
    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error('[ExtensionSession] Could not revoke extension session:', error);
    return NextResponse.json({ error: 'Could not disconnect the browser extension.' }, { status: 500 });
  }
}
