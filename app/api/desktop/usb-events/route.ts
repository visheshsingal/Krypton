import path from 'node:path';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { getOwnedActiveDevice, readSmallJson } from '@/lib/usb-dlp';
import { createUsbAuditHash, getUsbAuditSecret, USB_AUDIT_ZERO_HASH } from '@/lib/usb-audit';
import { UsbAuditHead, UsbTransferEvent } from '@/models/UsbTransferEvent';

const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const eventTypes = ['device_connected', 'device_disconnected', 'file_write_observed'] as const;
const sensitiveExtensions = new Set(['.env', '.pem', '.key', '.p12', '.pfx', '.kdbx', '.ppk']);

export async function POST(req: NextRequest) {
  try {
    const parsedBody = await readSmallJson(req);
    if (parsedBody.response) return parsedBody.response;
    const body = parsedBody.body;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const device = await getOwnedActiveDevice(req, input.deviceId);
    if (device.response) return device.response;
    if (!device.device!.usbMonitoringConsentAt) {
      return NextResponse.json({ error: 'USB monitoring consent is not active for this device.' }, { status: 403 });
    }

    const eventType = input.eventType;
    const transferStatus = input.transferStatus;
    const driveLetter = typeof input.driveLetter === 'string' ? input.driveLetter.toUpperCase() : '';
    const timestamp = new Date(String(input.timestamp || ''));
    if (!eventTypes.includes(eventType as (typeof eventTypes)[number]) ||
      !/^[A-Z]:$/.test(driveLetter) ||
      !Number.isFinite(timestamp.getTime()) ||
      timestamp.getTime() < Date.now() - MAX_EVENT_AGE_MS ||
      timestamp.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      return NextResponse.json({ error: 'USB event metadata is invalid or outside the accepted time window.' }, { status: 400 });
    }
    const validatedEventType = eventType as (typeof eventTypes)[number];

    const isFileWrite = validatedEventType === 'file_write_observed';
    const fileName = isFileWrite && typeof input.fileName === 'string' ? input.fileName.trim() : null;
    const destinationPath = isFileWrite && typeof input.destinationPath === 'string' ? input.destinationPath.trim() : null;
    const lowerFileName = fileName?.toLowerCase() || '';
    const extension = fileName
      ? lowerFileName === '.env' || lowerFileName.startsWith('.env.')
        ? '.env'
        : path.win32.extname(fileName).toLowerCase().slice(0, 32) ||
          (lowerFileName.startsWith('.') && lowerFileName.indexOf('.', 1) === -1 ? lowerFileName.slice(0, 32) : null)
      : null;
    const sizeBytes = isFileWrite && Number.isSafeInteger(input.sizeBytes) && Number(input.sizeBytes) >= 0
      ? Number(input.sizeBytes)
      : null;
    if (isFileWrite && (!fileName || fileName.length > 260 || !destinationPath || destinationPath.length > 1024 || sizeBytes === null)) {
      return NextResponse.json({ error: 'File-write events require a file name, destination, and valid size.' }, { status: 400 });
    }
    if (isFileWrite && destinationPath && fileName) {
      const windowsDestination = path.win32.resolve(destinationPath);
      const relativePath = path.win32.relative(`${driveLetter}\\`, windowsDestination);
      if (!relativePath || relativePath.startsWith('..') || path.win32.isAbsolute(relativePath) ||
        path.win32.basename(windowsDestination).toLowerCase() !== fileName.toLowerCase()) {
        return NextResponse.json({ error: 'Destination must be a file path on the reported removable drive.' }, { status: 400 });
      }
    }
    const expectedStatus = validatedEventType === 'device_connected'
      ? 'connected'
      : validatedEventType === 'device_disconnected'
        ? 'disconnected'
        : 'destination_write_observed';
    if (transferStatus !== expectedStatus) {
      return NextResponse.json({ error: 'USB event status does not match its event type.' }, { status: 400 });
    }

    const alertReasons: string[] = [];
    if (extension && sensitiveExtensions.has(extension)) alertReasons.push('Sensitive file type');
    if (sizeBytes !== null && sizeBytes >= 100 * 1024 * 1024) alertReasons.push('Large file (100 MB or more)');
    const eventsInLastMinute = await UsbTransferEvent.countDocuments({
      companyId: device.user!.companyId,
      deviceId: device.device!.deviceId,
      createdAt: { $gte: new Date(Date.now() - 60_000) },
    });
    if (eventsInLastMinute >= 600) {
      return NextResponse.json({ error: 'USB event rate limit exceeded.' }, { status: 429 });
    }
    const recentWrites = isFileWrite
      ? await UsbTransferEvent.countDocuments({
          companyId: device.user!.companyId,
          deviceId: device.device!.deviceId,
          eventType: 'file_write_observed',
          createdAt: { $gte: new Date(Date.now() - 60_000) },
        })
      : 0;
    if (isFileWrite && recentWrites >= 19) alertReasons.push('High-volume USB writes');

    const eventData = {
      companyId: device.user!.companyId,
      userId: device.user!.id,
      userName: device.user!.name,
      userEmail: device.user!.email,
      deviceId: device.device!.deviceId,
      deviceName: device.device!.deviceName,
      windowsUser: typeof input.windowsUser === 'string' ? input.windowsUser.trim().slice(0, 128) : '',
      eventType: validatedEventType,
      timestamp: new Date(),
      driveLetter,
      volumeLabel: typeof input.volumeLabel === 'string' ? input.volumeLabel.trim().slice(0, 200) : '',
      deviceModel: typeof input.deviceModel === 'string' ? input.deviceModel.trim().slice(0, 200) : null,
      deviceSerial: typeof input.deviceSerial === 'string' ? input.deviceSerial.trim().slice(0, 200) : null,
      fileName,
      extension,
      sizeBytes,
      sourcePath: null,
      destinationPath,
      transferStatus: expectedStatus,
      suspicious: alertReasons.length > 0,
      alertReasons,
    };

    const secret = getUsbAuditSecret();
    const session = await mongoose.startSession();
    let createdId = '';
    try {
      try {
        await UsbAuditHead.updateOne(
          { companyId: eventData.companyId, deviceId: eventData.deviceId },
          { $setOnInsert: { sequence: 0, lastHash: USB_AUDIT_ZERO_HASH } },
          { upsert: true },
        );
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
      }
      await session.withTransaction(async () => {
        const head = await UsbAuditHead.findOne({
          companyId: eventData.companyId,
          deviceId: eventData.deviceId,
        }).session(session);
        if (!head) throw new Error('USB audit chain head could not be initialized.');
        const sequence = head.sequence + 1;
        const integrityHash = createUsbAuditHash(eventData, sequence, head.lastHash, secret);
        const [created] = await UsbTransferEvent.create([{
          ...eventData,
          sequence,
          previousHash: head.lastHash,
          integrityHash,
        }], { session });
        const update = await UsbAuditHead.updateOne(
          { _id: head._id, sequence: head.sequence, lastHash: head.lastHash },
          { $set: { sequence, lastHash: integrityHash } },
          { session },
        );
        if (update.modifiedCount !== 1) throw new Error('USB audit chain changed concurrently; retry the event.');
        createdId = created._id.toString();
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ success: true, eventId: createdId, alerts: alertReasons }, { status: 201 });
  } catch (error) {
    console.error('[USBEvents] Could not ingest USB metadata:', error);
    return NextResponse.json({ error: 'Could not securely record USB activity.' }, { status: 500 });
  }
}
