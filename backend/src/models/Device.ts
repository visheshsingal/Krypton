import mongoose, { Schema, Document } from 'mongoose';
import { DeviceStatus } from '@krypton/shared';

export interface IDevice extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  status: DeviceStatus;
  lastHeartbeatAt: Date;
  activatedAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      default: 'win32',
    },
    osVersion: {
      type: String,
      default: 'Windows 11',
    },
    appVersion: {
      type: String,
      default: '1.0.0',
    },
    status: {
      type: String,
      enum: ['active', 'revoked', 'offline'],
      default: 'active',
      index: true,
    },
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
    },
    activatedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index on companyId + deviceId
DeviceSchema.index({ companyId: 1, deviceId: 1 }, { unique: true });

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
