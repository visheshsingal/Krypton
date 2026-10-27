import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDetectionRule extends Document {
  ruleCode: string;
  name: string;
  description: string;
  category:
    | 'api_key'
    | 'private_key'
    | 'password'
    | 'connection_string'
    | 'cloud_credential'
    | 'pii'
    | 'custom_keyword'
    | 'custom_regex';
  pattern: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: 'allow' | 'warn' | 'block';
  isEnabled: boolean;
  isBuiltIn: boolean;
  explanation: string;
  companyId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const DetectionRuleSchema = new Schema<IDetectionRule>(
  {
    ruleCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
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
      required: true,
    },
    pattern: { type: String, default: '' },
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'HIGH',
      required: true,
    },
    action: {
      type: String,
      enum: ['allow', 'warn', 'block'],
      default: 'block',
      required: true,
    },
    isEnabled: { type: Boolean, default: true },
    isBuiltIn: { type: Boolean, default: false },
    explanation: { type: String, default: '' },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
  },
  {
    timestamps: true,
  }
);

DetectionRuleSchema.index({ ruleCode: 1, companyId: 1 }, { unique: true });

export const DetectionRule: Model<IDetectionRule> =
  mongoose.models.DetectionRule ||
  mongoose.model<IDetectionRule>('DetectionRule', DetectionRuleSchema);
