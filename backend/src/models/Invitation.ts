import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '@krypton/shared';

export interface IInvitation extends Document {
  companyId: mongoose.Types.ObjectId;
  email: string;
  name: string;
  role: UserRole;
  token: string;
  assignLicense: boolean;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
  invitedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['company_admin', 'employee'],
      default: 'employee',
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    assignLicense: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

InvitationSchema.index({ companyId: 1, email: 1 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);
