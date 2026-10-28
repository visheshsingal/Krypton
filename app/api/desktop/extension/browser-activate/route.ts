import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { activateDesktopDevice } from '@/lib/licensing';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { Device } from '@/models/Device';
import { License } from '@/models/License';
import { User } from '@/models/User';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const value: unknown = await req.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return jsonResponse({ error: 'Enter your company license and account details.' }, 400);
    }

    const body = value as Record<string, unknown>;
    const licenseKey = typeof body.licenseKey === 'string' ? body.licenseKey.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const installationId = typeof body.installationId === 'string' ? body.installationId : '';
    const browser = body.browser === 'edge' ? 'edge' : body.browser === 'chrome' ? 'chrome' : null;
    if (
      !licenseKey || licenseKey.length > 100 ||
      !email || email.length > 254 ||
      !password || password.length > 256 ||
      !/^[0-9a-f-]{36}$/i.test(installationId) ||
      !browser
    ) {
      return jsonResponse({ error: 'Enter valid account details and choose Chrome or Edge.' }, 400);
    }

    const deviceId = `MAC-BROWSER-EXT-${installationId.toLowerCase()}`;
    const license = await License.findOne({ licenseKey: licenseKey.toUpperCase() }).select('companyId');
    const user = await User.findOne({ email }).select('_id');
    const existingSession = await BrowserExtensionSession.findOne({
      browserInstallationId: installationId,
    });
    if (
      existingSession &&
      (!license || !user ||
        existingSession.companyId.toString() !== license.companyId.toString() ||
        existingSession.userId.toString() !== user._id.toString())
    ) {
      return jsonResponse({
        error: 'This browser is linked to another account. Disconnect its current account before switching.',
      }, 409);
    }

    const activation = await activateDesktopDevice({
      licenseKey,
      email,
      password,
      deviceId,
      deviceName: `${browser === 'chrome' ? 'Chrome' : 'Edge'} on Mac`,
      platform: 'macos-browser-extension',
      osVersion: 'macOS browser extension',
      appVersion: '1.0.0',
    });
    if (!activation.success || !activation.user || !activation.license || !activation.device) {
      return jsonResponse(
        { error: activation.error || 'Browser activation was denied.' },
        activation.statusCode || 400
      );
    }

    const now = new Date();
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const sessionData = {
      companyId: activation.license.companyId,
      userId: activation.user._id,
      desktopDeviceId: activation.device.deviceId,
      browserInstallationId: installationId,
      browser,
      status: 'active' as const,
      sessionTokenHash: crypto.createHash('sha256').update(sessionToken).digest('hex'),
      sessionExpiresAt,
      lastHeartbeatAt: now,
      activatedAt: now,
      revokedAt: undefined,
      pairingCodeHash: undefined,
      pairingExpiresAt: undefined,
    };

    const session = existingSession
      ? await BrowserExtensionSession.findOneAndUpdate(
          { _id: existingSession._id, browserInstallationId: installationId },
          {
            $set: sessionData,
            $unset: { pairingCodeHash: 1, pairingExpiresAt: 1 },
          },
          { new: true }
        )
      : await BrowserExtensionSession.create(sessionData);
    if (!session) {
      return jsonResponse({ error: 'Browser activation changed during setup. Please try again.' }, 409);
    }

    return jsonResponse({
      status: 'protection_active',
      sessionToken,
      expiresAt: sessionExpiresAt.toISOString(),
      offlineGraceHours: activation.license.offlineGraceHours || 72,
      policy: activation.policy || null,
    });
  } catch (error) {
    console.error('[ExtensionBrowserActivation] Could not activate browser:', error);
    return jsonResponse({ error: 'Could not activate this browser.' }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const authorization = req.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (token.length < 32 || token.length > 200) {
      return jsonResponse({ error: 'A valid extension session is required.' }, 401);
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await BrowserExtensionSession.findOne({
      sessionTokenHash: tokenHash,
      status: 'active',
    }).select('+sessionTokenHash');
    if (!session) return jsonResponse({ success: true });

    const now = new Date();
    await Promise.all([
      BrowserExtensionSession.updateOne(
        { _id: session._id, sessionTokenHash: tokenHash },
        {
          $set: { status: 'revoked', revokedAt: now },
          $unset: { sessionTokenHash: 1, browserInstallationId: 1, pairingCodeHash: 1 },
        }
      ),
      session.desktopDeviceId.startsWith('MAC-BROWSER-EXT-')
        ? Device.updateOne(
            {
              companyId: session.companyId,
              userId: session.userId,
              deviceId: session.desktopDeviceId,
              platform: 'macos-browser-extension',
              status: 'active',
            },
            { $set: { status: 'revoked', revokedAt: now } }
          )
        : Promise.resolve(),
    ]);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[ExtensionBrowserActivation] Could not disconnect browser:', error);
    return jsonResponse({ error: 'Could not disconnect this browser.' }, 500);
  }
}
