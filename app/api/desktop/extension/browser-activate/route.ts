import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { Device } from '@/models/Device';
import { License } from '@/models/License';
import { User } from '@/models/User';
import { Company } from '@/models/Company';
import { Membership } from '@/models/Membership';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { Subscription } from '@/models/Subscription';

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
      return jsonResponse({ error: 'Enter your company license key.' }, 400);
    }

    const body = value as Record<string, unknown>;
    const licenseKey = typeof body.licenseKey === 'string' ? body.licenseKey.trim() : '';
    const installationId = typeof body.installationId === 'string' ? body.installationId : '';
    const browser = body.browser === 'edge' ? 'edge' : body.browser === 'chrome' ? 'chrome' : null;
    if (
      !licenseKey || licenseKey.length > 100 ||
      !/^[0-9a-f-]{36}$/i.test(installationId) ||
      !browser
    ) {
      return jsonResponse({ error: 'Enter a valid company license key and choose Chrome or Edge.' }, 400);
    }

    const deviceId = `MAC-BROWSER-EXT-${installationId.toLowerCase()}`;
    const license = await License.findOne({ licenseKey: licenseKey.toUpperCase() });
    if (!license || license.status !== 'active' || license.expiresAt <= new Date()) {
      return jsonResponse({ error: 'This company license key is invalid, inactive, or expired.' }, 403);
    }
    const company = await Company.findOne({ _id: license.companyId, status: 'active' });
    if (!company) return jsonResponse({ error: 'The company workspace is inactive.' }, 403);

    const subscription = await Subscription.findOne({ companyId: license.companyId });
    if (subscription) {
      const activeStatus = subscription.status === 'active' || subscription.status === 'trialing';
      const canceledButPaid = subscription.status === 'canceled' &&
        subscription.cancelAtPeriodEnd &&
        subscription.currentPeriodEnd > new Date();
      if ((!activeStatus && !canceledButPaid) || subscription.currentPeriodEnd <= new Date()) {
        return jsonResponse({ error: 'The company subscription is inactive or expired.' }, 403);
      }
    }

    const adminMembership = await Membership.findOne({
      companyId: license.companyId,
      role: 'company_admin',
      status: 'active',
      hasSeat: true,
    });
    const user = adminMembership
      ? await User.findOne({
          _id: adminMembership.userId,
          companyId: license.companyId,
          role: 'company_admin',
          isActive: true,
          hasLicenseSeat: true,
        })
      : null;
    if (!user) return jsonResponse({ error: 'No active, licensed company administrator is available.' }, 403);

    const existingSession = await BrowserExtensionSession.findOne({
      browserInstallationId: installationId,
    });
    if (
      existingSession &&
      (existingSession.adminRevoked ||
        existingSession.companyId.toString() !== license.companyId.toString() ||
        existingSession.userId.toString() !== user._id.toString())
    ) {
      return jsonResponse({
        error: 'This browser is already registered or was disabled by your company administrator. Contact your administrator.',
      }, 409);
    }

    const existingDevice = await Device.findOne({ companyId: license.companyId, userId: user._id, deviceId });
    if (existingDevice?.status === 'revoked' && (!existingSession || existingSession.adminRevoked)) {
      return jsonResponse({ error: 'This browser device was revoked by your company administrator.' }, 403);
    }

    const activeDeviceCount = await Device.countDocuments({
      companyId: license.companyId,
      userId: user._id,
      status: 'active',
    });
    if (!existingDevice && activeDeviceCount >= (license.maxDevicesPerUser || 2)) {
      return jsonResponse({ error: 'The company administrator account has reached its device limit.' }, 409);
    }
    const device = existingDevice || await Device.create({
      companyId: license.companyId,
      userId: user._id,
      deviceId,
      deviceName: `${browser === 'chrome' ? 'Chrome' : 'Edge'} browser`,
      platform: 'macos-browser-extension',
      osVersion: 'macOS browser extension',
      appVersion: '1.0.0',
      status: 'active',
    });
    if (device.status !== 'active') {
      device.status = 'active';
      device.revokedAt = undefined;
      await device.save();
    }

    const now = new Date();
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const sessionData = {
      companyId: license.companyId,
      userId: user._id,
      desktopDeviceId: device.deviceId,
      browserInstallationId: installationId,
      browser,
      status: 'active' as const,
      sessionTokenHash: crypto.createHash('sha256').update(sessionToken).digest('hex'),
      sessionExpiresAt,
      lastHeartbeatAt: now,
      activatedAt: now,
      revokedAt: undefined,
      adminRevoked: false,
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
      offlineGraceHours: license.offlineGraceHours || 72,
      policy: await SecurityPolicy.findOne({ companyId: license.companyId }),
    });
  } catch (error) {
    console.error('[ExtensionBrowserActivation] Could not activate browser:', error);
    return jsonResponse({ error: 'Could not activate this browser.' }, 500);
  }
}
