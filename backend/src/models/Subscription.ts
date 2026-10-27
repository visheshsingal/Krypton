import mongoose, { Schema, Document } from 'mongoose';
import { SubscriptionPlan, SubscriptionStatus } from '@krypton/shared';

export interface ISubscription extends Document {
  companyId: mongoose.Types.ObjectId;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  seatsPurchased: number;
  billingInterval: 'month' | 'year';
  amountPerSeatCents: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  razorpaySubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['starter', 'business', 'enterprise'],
      default: 'starter',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'trialing', 'past_due', 'canceled', 'paused'],
      default: 'active',
      index: true,
    },
    seatsPurchased: { type: Number, required: true, default: 5 },
    billingInterval: { type: String, enum: ['month', 'year'], default: 'month' },
    amountPerSeatCents: { type: Number, default: 1200 }, // $12/seat/mo
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    razorpaySubscriptionId: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
