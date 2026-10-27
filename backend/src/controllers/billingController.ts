import { Request, Response } from 'express';
import { processBillingWebhook, applySubscriptionUpdate } from '../services/billingService';
import { Company } from '../models/Company';
import { License } from '../models/License';
import { Subscription } from '../models/Subscription';

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'] as string || req.headers['x-razorpay-signature'] as string;
  const rawBody = req.body;

  const result = await processBillingWebhook(rawBody, signature);
  if (!result.handled) {
    res.status(400).json({ error: result.error || 'Webhook handling failed' });
    return;
  }

  res.json({ received: true, event: result.event });
}

export async function simulateBillingUpdate(req: Request, res: Response): Promise<void> {
  const companyId = req.body.companyId;
  const { plan = 'business', seats = 10, status = 'active' } = req.body;

  if (!companyId) {
    res.status(400).json({ error: 'Company ID required' });
    return;
  }

  await applySubscriptionUpdate(companyId, plan, seats, status);

  const [company, license, subscription] = await Promise.all([
    Company.findById(companyId),
    License.findOne({ companyId }),
    Subscription.findOne({ companyId }),
  ]);

  res.json({
    message: 'Billing simulation applied successfully',
    company,
    license,
    subscription,
  });
}
