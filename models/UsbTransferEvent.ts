import mongoose, { Document, Model, Schema } from 'mongoose';

export type UsbActivityEventType = 'device_connected' | 'device_disconnected' | 'file_write_observed';

export interface IUsbTransferEvent extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  deviceId: string;
  deviceName: string;
  windowsUser: string;
  eventType: UsbActivityEventType;
  timestamp: Date;
  driveLetter: string;
  volumeLabel: string;
  deviceModel: string | null;
  deviceSerial: string | null;
  fileName: string | null;
  extension: string | null;
  sizeBytes: number | null;
  sourcePath: null;
  destinationPath: string | null;
  transferStatus: 'connected' | 'disconnected' | 'destination_write_observed';
  suspicious: boolean;
  alertReasons: string[];
  sequence: number;
  previousHash: string;
  integrityHash: string;
  createdAt: Date;
}

const UsbTransferEventSchema = new Schema<IUsbTransferEvent>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true, maxlength: 200 },
    userEmail: { type: String, required: true, maxlength: 320 },
    deviceId: { type: String, required: true, maxlength: 128 },
    deviceName: { type: String, required: true, maxlength: 200 },
    windowsUser: { type: String, required: true, maxlength: 128 },
    eventType: {
      type: String,
      enum: ['device_connected', 'device_disconnected', 'file_write_observed'],
      required: true,
    },
    timestamp: { type: Date, required: true, index: true },
    driveLetter: { type: String, required: true, match: /^[A-Z]:$/ },
    volumeLabel: { type: String, default: '', maxlength: 200 },
    deviceModel: { type: String, default: null, maxlength: 200 },
    deviceSerial: { type: String, default: null, maxlength: 200 },
    fileName: { type: String, default: null, maxlength: 260 },
    extension: { type: String, default: null, maxlength: 32 },
    sizeBytes: { type: Number, default: null, min: 0 },
    sourcePath: { type: String, default: null, immutable: true },
    destinationPath: { type: String, default: null, maxlength: 1024 },
    transferStatus: {
      type: String,
      enum: ['connected', 'disconnected', 'destination_write_observed'],
      required: true,
    },
    suspicious: { type: Boolean, default: false },
    alertReasons: { type: [String], default: [] },
    sequence: { type: Number, required: true },
    previousHash: { type: String, required: true, minlength: 64, maxlength: 64 },
    integrityHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: 'throw',
  }
);

UsbTransferEventSchema.index({ companyId: 1, timestamp: -1 });
UsbTransferEventSchema.index({ companyId: 1, userId: 1, timestamp: -1 });
UsbTransferEventSchema.index({ companyId: 1, deviceId: 1, timestamp: -1 });
UsbTransferEventSchema.index({ companyId: 1, deviceId: 1, createdAt: -1 });
UsbTransferEventSchema.index({ companyId: 1, deviceId: 1, sequence: 1 }, { unique: true });

export const UsbTransferEvent: Model<IUsbTransferEvent> =
  mongoose.models.UsbTransferEvent ||
  mongoose.model<IUsbTransferEvent>('UsbTransferEvent', UsbTransferEventSchema);

export interface IUsbAuditHead extends Document {
  companyId: mongoose.Types.ObjectId;
  deviceId: string;
  sequence: number;
  lastHash: string;
}

const UsbAuditHeadSchema = new Schema<IUsbAuditHead>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  deviceId: { type: String, required: true, maxlength: 128 },
  sequence: { type: Number, required: true, default: 0 },
  lastHash: { type: String, required: true, default: '0'.repeat(64), minlength: 64, maxlength: 64 },
});
UsbAuditHeadSchema.index({ companyId: 1, deviceId: 1 }, { unique: true });

export const UsbAuditHead: Model<IUsbAuditHead> =
  mongoose.models.UsbAuditHead || mongoose.model<IUsbAuditHead>('UsbAuditHead', UsbAuditHeadSchema);
