import mongoose, { Schema, Document } from 'mongoose';
import { DetectionRuleSchema, IDetectionRule } from './DetectionRule';

export interface ISecurityPolicy extends Document {
  companyId: mongoose.Types.ObjectId;
  blockCriticalRisk: boolean;
  blockHighRisk: boolean;
  warnMediumRisk: boolean;
  allowLowRisk: boolean;
  allowEmployeeBypassWarning: boolean;
  enablePiiDetection: boolean;
  enableSecretDetection: boolean;
  enableCustomRules: boolean;
  maxDevicesPerUser: number;
  offlineGracePeriodHours: number;
  fullPromptLoggingEnabled: boolean;
  customRules: IDetectionRule[];
  createdAt: Date;
  updatedAt: Date;
}

const SecurityPolicySchema = new Schema<ISecurityPolicy>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    blockCriticalRisk: { type: Boolean, default: true },
    blockHighRisk: { type: Boolean, default: true },
    warnMediumRisk: { type: Boolean, default: true },
    allowLowRisk: { type: Boolean, default: true },
    allowEmployeeBypassWarning: { type: Boolean, default: true },
    enablePiiDetection: { type: Boolean, default: true },
    enableSecretDetection: { type: Boolean, default: true },
    enableCustomRules: { type: Boolean, default: true },
    maxDevicesPerUser: { type: Number, default: 2, min: 1, max: 10 },
    offlineGracePeriodHours: { type: Number, default: 72, min: 1, max: 720 },
    fullPromptLoggingEnabled: { type: Boolean, default: false },
    customRules: [DetectionRuleSchema],
  },
  {
    timestamps: true,
  }
);

export const SecurityPolicy = mongoose.model<ISecurityPolicy>('SecurityPolicy', SecurityPolicySchema);
