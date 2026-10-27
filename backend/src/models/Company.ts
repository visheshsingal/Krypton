import mongoose, { Schema, Document } from 'mongoose';
import { SubscriptionPlan } from '@krypton/shared';

export interface ICompany extends Document {
  name: string;
  slug: string;
  domain?: string;
  plan: SubscriptionPlan;
  status: 'active' | 'suspended' | 'trialing' | 'canceled';
  contactEmail?: string;
  phone?: string;
  website?: string;
  settings?: {
    allowedDomains?: string[];
    defaultMaxDevices?: number;
    defaultOfflineGraceHours?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    domain: { type: String, lowercase: true, trim: true },
    plan: {
      type: String,
      enum: ['starter', 'business', 'enterprise'],
      default: 'starter',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'trialing', 'canceled'],
      default: 'active',
      index: true,
    },
    contactEmail: { type: String, lowercase: true, trim: true },
    phone: { type: String },
    website: { type: String },
    settings: {
      allowedDomains: [{ type: String }],
      defaultMaxDevices: { type: Number, default: 2 },
      defaultOfflineGraceHours: { type: Number, default: 72 },
    },
  },
  {
    timestamps: true,
  }
);

export const Company = mongoose.model<ICompany>('Company', CompanySchema);
