import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { validateExtensionEntitlement } from '@/lib/extension-licensing';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user?.companyId || auth.user.role === 'super_admin') {
      return NextResponse.json({ error: auth.error || 'Company account required.' }, { status: auth.status || 403 });
    }

    await connectDB();
    const deviceId = req.nextUrl.searchParams.get('deviceId')?.trim();
    if (!deviceId || deviceId.length > 200) {
      return NextResponse.json({ error: 'Valid device ID is required.' }, { status: 400 });
    }

    const entitlement = await validateExtensionEntitlement({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      deviceId,
    });
    const session = await BrowserExtensionSession.findOne({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      desktopDeviceId: deviceId,
    }).sort({ updatedAt: -1 });

    const connected = Boolean(
      session?.status === 'active' &&
      session.lastHeartbeatAt &&
      Date.now() - session.lastHeartbeatAt.getTime() < 10 * 60 * 1000 &&
      session.sessionExpiresAt &&
      session.sessionExpiresAt.getTime() > Date.now()
    );
    const licenseInvalid = Boolean(session?.status === 'active' && !entitlement.valid);
    return NextResponse.json({
      installed: Boolean(session?.browserInstallationId),
      connected,
      licenseInvalid,
      protectionActive: connected && entitlement.valid,
      browser: session?.browser || null,
      status: licenseInvalid
        ? 'license_invalid'
        : connected && entitlement.valid
          ? 'protection_active'
          : session?.browserInstallationId
            ? 'installed'
            : 'not_installed',
      lastConnectedAt: session?.lastHeartbeatAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('[ExtensionStatus] Could not read status:', error);
    return NextResponse.json({ error: 'Could not load browser extension status.' }, { status: 500 });
  }
}
