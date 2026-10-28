import { NextRequest, NextResponse } from 'next/server';
import { getOwnedActiveDevice, readSmallJson } from '@/lib/usb-dlp';

const CONSENT_VERSION = 'usb-monitoring-v1';

export async function POST(req: NextRequest) {
  try {
    const parsedBody = await readSmallJson(req);
    if (parsedBody.response) return parsedBody.response;
    const body = parsedBody.body;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const { deviceId, enabled } = body as { deviceId?: unknown; enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean.' }, { status: 400 });
    }
    const result = await getOwnedActiveDevice(req, deviceId, enabled);
    if (result.response) return result.response;

    result.device!.usbMonitoringConsentAt = enabled ? new Date() : undefined;
    result.device!.usbMonitoringConsentVersion = enabled ? CONSENT_VERSION : undefined;
    await result.device!.save();
    return NextResponse.json({
      enabled,
      consentVersion: enabled ? CONSENT_VERSION : null,
      consentAt: enabled ? result.device!.usbMonitoringConsentAt : null,
    });
  } catch (error) {
    console.error('[USBMonitoring] Could not update monitoring consent:', error);
    return NextResponse.json({ error: 'Could not update USB monitoring consent.' }, { status: 500 });
  }
}
