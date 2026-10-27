import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMembership extends Document {
  userId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  role: 'company_admin' | 'employee';
  status: 'active' | 'invited' | 'deactivated';
  hasSeat: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    role: {
      type: String,
      enum: ['company_admin', 'employee'],
      default: 'employee',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'deactivated'],
      default: 'active',
      index: true,
    },
    hasSeat: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

MembershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });

export const Membership: Model<IMembership> =
  mongoose.models.Membership || mongoose.model<IMembership>('Membership', MembershipSchema);
