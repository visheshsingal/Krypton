import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { validateExtensionEntitlement } from '@/lib/extension-licensing';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const explicitCompanyId = req.headers.get('x-company-id') || req.nextUrl.searchParams.get('companyId');
    const tenant = enforceTenant(auth.user, explicitCompanyId);
    if (tenant.error || !tenant.companyId) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status || 403 });
    }

    await connectDB();
    const companyId = tenant.companyId;

    const devices = await Device.find({ companyId })
      .populate('userId', 'name email')
      .sort({ lastHeartbeatAt: -1 });
    const extensionSessions = await BrowserExtensionSession.find({ companyId })
      .sort({ updatedAt: -1 })
      .lean();
    const latestExtensionByDevice = new Map<string, typeof extensionSessions[number]>();
    for (const session of extensionSessions) {
      if (!latestExtensionByDevice.has(session.desktopDeviceId)) {
        latestExtensionByDevice.set(session.desktopDeviceId, session);
      }
    }

    return NextResponse.json({
      devices: await Promise.all(devices.map(async (d: any) => {
        const extension = latestExtensionByDevice.get(d.deviceId);
        const connected = Boolean(
          extension?.status === 'active' &&
          extension.lastHeartbeatAt &&
          Date.now() - extension.lastHeartbeatAt.getTime() < 10 * 60 * 1000 &&
          extension.sessionExpiresAt &&
          extension.sessionExpiresAt.getTime() > Date.now()
        );
        const entitlement = extension && connected
          ? await validateExtensionEntitlement({
              companyId: extension.companyId.toString(),
              userId: extension.userId.toString(),
              deviceId: extension.desktopDeviceId,
            })
          : null;
        const protectionActive = connected && d.status === 'active' && entitlement?.valid === true;
        return {
          id: d._id,
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          platform: d.platform,
          osVersion: d.osVersion,
          appVersion: d.appVersion,
          status: d.status,
          lastHeartbeatAt: d.lastHeartbeatAt,
          activatedAt: d.activatedAt,
          extension: {
            installed: Boolean(extension?.browserInstallationId),
            connected,
            protectionActive,
            adminRevoked: extension?.adminRevoked === true,
            browser: extension?.browser || null,
            status: protectionActive
              ? 'Protection Active'
              : extension?.adminRevoked
                ? 'Disabled by administrator'
              : entitlement && !entitlement.valid
                ? entitlement.reason === 'device_revoked' ? 'Device Revoked' : 'License Invalid'
                : extension?.browserInstallationId
                  ? 'Installed'
                  : 'Not Installed',
          },
          user: d.userId
            ? {
                id: d.userId._id,
                name: d.userId.name,
                email: d.userId.email,
              }
            : null,
        };
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
