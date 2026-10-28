import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, enforceTenant } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { UsbTransferEvent } from '@/models/UsbTransferEvent';
import { Device } from '@/models/Device';
import { UsbAuditHead } from '@/models/UsbTransferEvent';
import { createUsbAuditHash, getUsbAuditSecret, USB_AUDIT_ZERO_HASH, verifyUsbAuditHash } from '@/lib/usb-audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error || 'Authentication required.' }, { status: auth.status || 401 });
    }
    const tenant = enforceTenant(auth.user, req.nextUrl.searchParams.get('companyId'));
    if (tenant.error || !tenant.companyId) {
      return NextResponse.json({ error: tenant.error || 'Company access required.' }, { status: tenant.status || 403 });
    }
    await connectDB();

    const { searchParams } = req.nextUrl;
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const eventType = searchParams.get('eventType');
    const filter: Record<string, unknown> = { companyId: tenant.companyId };
    if (['device_connected', 'device_disconnected', 'file_write_observed'].includes(eventType || '')) {
      filter.eventType = eventType;
    }
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { windowsUser: { $regex: escaped, $options: 'i' } },
        { deviceName: { $regex: escaped, $options: 'i' } },
        { deviceId: { $regex: escaped, $options: 'i' } },
        { driveLetter: { $regex: escaped, $options: 'i' } },
        { volumeLabel: { $regex: escaped, $options: 'i' } },
        { fileName: { $regex: escaped, $options: 'i' } },
        { destinationPath: { $regex: escaped, $options: 'i' } },
      ];
    }

    const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 200);
    const [events, devices] = await Promise.all([
      UsbTransferEvent.find(filter).sort({ timestamp: -1 }).limit(limit).select('-__v').lean(),
      Device.find({ companyId: tenant.companyId }).populate('userId', 'name email').select(
        'deviceId deviceName status usbMonitoringConsentAt userId',
      ).lean(),
    ]);
    const deviceIds = events
      .map((event) => event.deviceId)
      .filter((deviceId, index, list) => list.indexOf(deviceId) === index);
    const heads = deviceIds.length
      ? await UsbAuditHead.find({ companyId: tenant.companyId, deviceId: { $in: deviceIds } }).lean()
      : [];
    const previousLookups = events
      .filter((event) => event.sequence > 1)
      .map((event) => ({ deviceId: event.deviceId, sequence: event.sequence - 1 }));
    const predecessors = previousLookups.length
      ? await UsbTransferEvent.find({ companyId: tenant.companyId, $or: previousLookups })
        .select('deviceId sequence integrityHash')
        .lean()
      : [];
    const headEvents = heads.length
      ? await UsbTransferEvent.find({
          companyId: tenant.companyId,
          $or: heads.map((head) => ({ deviceId: head.deviceId, sequence: head.sequence })),
        }).select('deviceId sequence integrityHash').lean()
      : [];
    const headByDevice = new Map(heads.map((head) => [head.deviceId, head]));
    const predecessorByKey = new Map(predecessors.map((event) => [`${event.deviceId}:${event.sequence}`, event]));
    const headEventByDevice = new Map(headEvents.map((event) => [event.deviceId, event]));
    const secret = getUsbAuditSecret();
    return NextResponse.json({
      monitoredDevices: devices.map((device) => {
        const user = device.userId as unknown as { name?: string; email?: string } | null;
        return {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          deviceStatus: device.status,
          consentAt: device.usbMonitoringConsentAt || null,
          userName: user?.name || 'Unknown employee',
          userEmail: user?.email || '',
        };
      }),
      events: events.map((event) => {
        const canonicalEvent = {
          companyId: event.companyId.toString(),
          userId: event.userId.toString(),
          userName: event.userName,
          userEmail: event.userEmail,
          deviceId: event.deviceId,
          deviceName: event.deviceName,
          windowsUser: event.windowsUser,
          eventType: event.eventType,
          timestamp: event.timestamp,
          driveLetter: event.driveLetter,
          volumeLabel: event.volumeLabel,
          deviceModel: event.deviceModel,
          deviceSerial: event.deviceSerial,
          fileName: event.fileName,
          extension: event.extension,
          sizeBytes: event.sizeBytes,
          sourcePath: null,
          destinationPath: event.destinationPath,
          transferStatus: event.transferStatus,
          suspicious: event.suspicious,
          alertReasons: event.alertReasons,
        };
        const expectedHash = createUsbAuditHash(canonicalEvent, event.sequence, event.previousHash, secret);
        const head = headByDevice.get(event.deviceId);
        const headEvent = headEventByDevice.get(event.deviceId);
        const previous = event.sequence === 1
          ? null
          : predecessorByKey.get(`${event.deviceId}:${event.sequence - 1}`);
        const chainGap = event.sequence === 1
          ? event.previousHash !== USB_AUDIT_ZERO_HASH
          : !previous || previous.integrityHash !== event.previousHash;
        const missingHeadEvent = !head || !headEvent || headEvent.integrityHash !== head.lastHash;
        const headMismatch = Boolean(head && event.sequence === head.sequence && head.lastHash !== event.integrityHash);
        const integrityStatus = !verifyUsbAuditHash(event.integrityHash, expectedHash) || headMismatch
          ? 'tampered'
          : chainGap || missingHeadEvent
            ? 'chain_gap'
            : 'verified';
        return {
          id: event._id.toString(),
          userId: event.userId.toString(),
          userName: event.userName,
          userEmail: event.userEmail,
          deviceId: event.deviceId,
          deviceName: event.deviceName,
          windowsUser: event.windowsUser,
          eventType: event.eventType,
          timestamp: event.timestamp,
          driveLetter: event.driveLetter,
          volumeLabel: event.volumeLabel,
          deviceModel: event.deviceModel,
          deviceSerial: event.deviceSerial,
          fileName: event.fileName,
          extension: event.extension,
          sizeBytes: event.sizeBytes,
          sourcePath: null,
          destinationPath: event.destinationPath,
          transferStatus: event.transferStatus,
          suspicious: event.suspicious,
          alertReasons: event.alertReasons,
          integrityStatus,
        };
      }),
    });
  } catch (error) {
    console.error('[CompanyUsbEvents] Could not read USB activity:', error);
    return NextResponse.json({ error: 'Could not load USB activity.' }, { status: 500 });
  }
}
