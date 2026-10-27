import crypto from 'crypto';
import { verifyStripeSignature } from '../src/services/billingService';

describe('Stripe webhook signature validation', () => {
  const secret = 'whsec_test_secret_for_signature_validation';
  const rawBody = Buffer.from('{"id":"evt_test","type":"customer.subscription.updated"}');
  const now = 1_800_000_000;

  function signatureFor(timestamp: number, body = rawBody): string {
    const digest = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body.toString('utf8')}`, 'utf8')
      .digest('hex');
    return `t=${timestamp},v1=${digest}`;
  }

  test('accepts a valid signature over the exact raw body', () => {
    expect(verifyStripeSignature(rawBody, signatureFor(now), secret, now)).toBe(true);
  });

  test('rejects a missing signature and altered payload', () => {
    expect(verifyStripeSignature(rawBody, undefined, secret, now)).toBe(false);
    expect(verifyStripeSignature(Buffer.from('{"id":"tampered"}'), signatureFor(now), secret, now)).toBe(false);
  });

  test('rejects stale timestamps', () => {
    expect(verifyStripeSignature(rawBody, signatureFor(now - 301), secret, now)).toBe(false);
  });
});
