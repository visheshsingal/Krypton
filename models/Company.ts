import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  slug: string;
  domain?: string;
  plan: 'starter' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'trialing' | 'canceled';
  contactEmail?: string;
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

export const Company: Model<ICompany> =
  mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema);
