import crypto from 'crypto';
import { config } from '../config/env';
import { Company } from '../models/Company';
import { Subscription } from '../models/Subscription';
import { License } from '../models/License';
import { createAuditLog } from './auditService';
import mongoose from 'mongoose';

export interface BillingWebhookResult {
  handled: boolean;
  event: string;
  companyId?: string;
  error?: string;
}

/**
 * Handles incoming payment provider webhooks (Stripe / Razorpay).
 * Validates cryptographic signatures server-side before updating subscription and seat limits.
 */
export async function processBillingWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
  provider: 'stripe' | 'razorpay' = 'stripe'
): Promise<BillingWebhookResult> {
  // If in development mode and mock secret is configured, allow simulated test webhooks
  if (config.nodeEnv === 'development' && signature === 'dev_mock_signature') {
    return handleDevMockWebhook(rawBody);
  }

  if (provider === 'stripe') {
    const webhookSecret = config.billing.stripeWebhookSecret;
    if (!webhookSecret) {
      return { handled: false, event: 'unknown', error: 'Stripe webhook secret is not configured' };
    }

    if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
      return { handled: false, event: 'unknown', error: 'Invalid Stripe webhook signature' };
    }

    try {
      const payload: any = JSON.parse(
        typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
      );

      const eventType = payload.type || payload.event;

      switch (eventType) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscriptionData = payload.data?.object;
          const companyId = subscriptionData?.metadata?.companyId;
          const seats = parseInt(subscriptionData?.metadata?.seats || '5', 10);
          const plan = subscriptionData?.metadata?.plan || 'starter';

          if (companyId) {
            await applySubscriptionUpdate(companyId, plan, seats, 'active');
          }
          return { handled: true, event: eventType, companyId };
        }

        case 'customer.subscription.deleted': {
          const subscriptionData = payload.data?.object;
          const companyId = subscriptionData?.metadata?.companyId;
          if (companyId) {
            await handleSubscriptionCanceled(companyId);
          }
          return { handled: true, event: eventType, companyId };
        }

        case 'invoice.payment_failed': {
          const invoice = payload.data?.object;
          const companyId = invoice?.subscription_details?.metadata?.companyId;
          if (companyId) {
            await Subscription.findOneAndUpdate(
              { companyId: new mongoose.Types.ObjectId(companyId) },
              { status: 'past_due' }
            );
          }
          return { handled: true, event: eventType, companyId };
        }

        default:
          return { handled: true, event: eventType || 'unhandled' };
      }
    } catch (err: any) {
      return { handled: false, event: 'parse_error', error: err.message };
    }
  }

  return { handled: false, event: 'unsupported_provider', error: `Provider ${provider} not configured` };
}

export function verifyStripeSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const entries = signatureHeader.split(',').map((entry) => entry.trim().split('=', 2));
  const timestampValue = entries.find(([key]) => key === 't')?.[1];
  const signatures = entries.filter(([key]) => key === 'v1').map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;

  const rawPayload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawPayload}`, 'utf8')
    .digest();

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const candidate = Buffer.from(signature, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

async function handleDevMockWebhook(rawBody: Buffer | string): Promise<BillingWebhookResult> {
  const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
  const { event, companyId, plan, seats } = payload;

  if (companyId && (event === 'subscription.created' || event === 'subscription.updated')) {
    await applySubscriptionUpdate(companyId, plan || 'business', seats || 10, 'active');
  }

  return { handled: true, event: event || 'dev_mock_event', companyId };
}

export async function applySubscriptionUpdate(
  companyId: string,
  plan: 'starter' | 'business' | 'enterprise',
  seatLimit: number,
  status: 'active' | 'trialing' | 'past_due' | 'canceled'
) {
  const companyObjId = new mongoose.Types.ObjectId(companyId);

  await Company.findByIdAndUpdate(companyObjId, { plan, status: status === 'active' ? 'active' : 'suspended' });

  // Update or create subscription
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  await Subscription.findOneAndUpdate(
    { companyId: companyObjId },
    {
      plan,
      status,
      seatsPurchased: seatLimit,
      currentPeriodStart: now,
      currentPeriodEnd: nextMonth,
    },
    { upsert: true, new: true }
  );

  // Update license seatLimit
  await License.findOneAndUpdate(
    { companyId: companyObjId },
    {
      plan,
      seatLimit,
      status: status === 'active' ? 'active' : 'suspended',
      expiresAt: nextMonth,
    }
  );
}

export async function handleSubscriptionCanceled(companyId: string) {
  const companyObjId = new mongoose.Types.ObjectId(companyId);
  await Company.findByIdAndUpdate(companyObjId, { status: 'canceled' });
  await Subscription.findOneAndUpdate({ companyId: companyObjId }, { status: 'canceled' });
  await License.findOneAndUpdate({ companyId: companyObjId }, { status: 'suspended' });
}
