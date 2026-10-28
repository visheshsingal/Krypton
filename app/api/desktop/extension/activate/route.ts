import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { normalizePairingCode, sha256, validateExtensionEntitlement } from '@/lib/extension-licensing';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { SecurityPolicy } from '@/models/SecurityPolicy';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const value: unknown = await req.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return NextResponse.json({ error: 'Enter the valid one-time code shown in Krypton Desktop.' }, { status: 400 });
    }
    const body = value as Record<string, unknown>;
    const pairingCode = normalizePairingCode(body.pairingCode);
    const installationId = typeof body.installationId === 'string' ? body.installationId : '';
    const browser = body.browser === 'edge' ? 'edge' : body.browser === 'chrome' ? 'chrome' : null;
    if (!pairingCode || !/^[0-9a-f-]{36}$/i.test(installationId) || !browser) {
      return NextResponse.json({ error: 'Enter the valid one-time code shown in Krypton Desktop.' }, { status: 400 });
    }

    const now = new Date();
    const pending = await BrowserExtensionSession.findOne({
      pairingCodeHash: sha256(pairingCode),
      status: 'pending',
      pairingExpiresAt: { $gt: now },
    }).select('+pairingCodeHash');
    if (!pending) {
      return NextResponse.json({ error: 'Pairing code is invalid, expired, or already used.' }, { status: 401 });
    }
    if (pending.browser !== browser) {
      return NextResponse.json({ error: `This code was generated for ${pending.browser === 'chrome' ? 'Chrome' : 'Edge'}.` }, { status: 400 });
    }

    const entitlement = await validateExtensionEntitlement({
      companyId: pending.companyId.toString(),
      userId: pending.userId.toString(),
      deviceId: pending.desktopDeviceId,
    });
    if (!entitlement.valid) {
      pending.status = 'revoked';
      pending.revokedAt = now;
      pending.pairingCodeHash = undefined;
      await pending.save();
      return NextResponse.json({ error: 'The desktop device or company license is no longer active.' }, { status: 403 });
    }

    const previousSession = await BrowserExtensionSession.findOne({
      browserInstallationId: installationId,
      status: 'active',
    });
    if (previousSession && previousSession._id.toString() !== pending._id.toString()) {
      await BrowserExtensionSession.updateOne(
        { _id: previousSession._id },
        {
          $set: { status: 'revoked', revokedAt: now },
          $unset: { sessionTokenHash: 1, browserInstallationId: 1 },
        }
      );
    }

    const rawSessionToken = crypto.randomBytes(32).toString('base64url');
    const activated = await BrowserExtensionSession.findOneAndUpdate(
      {
        _id: pending._id,
        status: 'pending',
        pairingExpiresAt: { $gt: now },
      },
      {
        $set: {
          browserInstallationId: installationId,
          status: 'active',
          sessionTokenHash: sha256(rawSessionToken),
          sessionExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          lastHeartbeatAt: now,
          activatedAt: now,
        },
        $unset: { pairingCodeHash: 1, pairingExpiresAt: 1 },
      },
      { new: true }
    );
    if (!activated) {
      return NextResponse.json({ error: 'Pairing code was already used. Generate a new code in Krypton Desktop.' }, { status: 409 });
    }

    const policy = await SecurityPolicy.findOne({ companyId: entitlement.companyId });
    return NextResponse.json({
      status: 'protection_active',
      sessionToken: rawSessionToken,
      expiresAt: activated.sessionExpiresAt?.toISOString(),
      offlineGraceHours: entitlement.license?.offlineGraceHours || 72,
      policy,
    });
  } catch (error) {
    console.error('[ExtensionPairing] Could not activate extension:', error);
    return NextResponse.json({ error: 'Could not activate this extension.' }, { status: 500 });
  }
}
