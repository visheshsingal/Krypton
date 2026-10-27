import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILicense extends Document {
  companyId: mongoose.Types.ObjectId;
  licenseKey: string;
  plan: 'starter' | 'business' | 'enterprise';
  seatLimit: number;
  occupiedSeats: number;
  status: 'active' | 'suspended' | 'expired' | 'revoked';
  maxDevicesPerUser: number;
  offlineGraceHours: number;
  expiresAt: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LicenseSchema = new Schema<ILicense>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    licenseKey: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['starter', 'business', 'enterprise'],
      default: 'starter',
      required: true,
    },
    seatLimit: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },
    occupiedSeats: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'expired', 'revoked'],
      default: 'active',
      index: true,
    },
    maxDevicesPerUser: {
      type: Number,
      default: 2,
      min: 1,
    },
    offlineGraceHours: {
      type: Number,
      default: 72,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export const License: Model<ILicense> =
  mongoose.models.License || mongoose.model<ILicense>('License', LicenseSchema);
