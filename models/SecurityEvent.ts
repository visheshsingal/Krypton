import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISecurityEvent extends Document {
  companyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userEmail: string;
  userName: string;
  deviceId: string;
  deviceName: string;
  targetApp: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ruleCode: string;
  ruleName: string;
  category?:
    | 'api_key'
    | 'private_key'
    | 'password'
    | 'connection_string'
    | 'cloud_credential'
    | 'pii'
    | 'custom_keyword'
    | 'custom_regex';
  actionTaken: 'allow' | 'warn' | 'block';
  redactedPreview: string;
  explanation: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SecurityEventSchema = new Schema<ISecurityEvent>(
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
    userEmail: { type: String, required: true, trim: true },
    userName: { type: String, required: true, trim: true },
    deviceId: { type: String, required: true, index: true },
    deviceName: { type: String, required: true },
    targetApp: { type: String, default: 'Krypton Demonstration Sandbox' },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      required: true,
      index: true,
    },
    ruleCode: { type: String, required: true, index: true },
    ruleName: { type: String, required: true },
    category: {
      type: String,
      enum: [
        'api_key',
        'private_key',
        'password',
        'connection_string',
        'cloud_credential',
        'pii',
        'custom_keyword',
        'custom_regex',
      ],
      index: true,
    },
    actionTaken: {
      type: String,
      enum: ['allow', 'warn', 'block'],
      required: true,
      index: true,
    },
    redactedPreview: { type: String, required: true, trim: true },
    explanation: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

SecurityEventSchema.index({ companyId: 1, timestamp: -1 });
SecurityEventSchema.index({ companyId: 1, riskLevel: 1, timestamp: -1 });
SecurityEventSchema.index({ companyId: 1, actionTaken: 1, timestamp: -1 });

export const SecurityEvent: Model<ISecurityEvent> =
  mongoose.models.SecurityEvent ||
  mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);
