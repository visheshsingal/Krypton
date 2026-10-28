import { createHmac, timingSafeEqual } from 'node:crypto';

export const USB_AUDIT_ZERO_HASH = '0'.repeat(64);

export function getUsbAuditSecret(): string {
  const secret = process.env.USB_AUDIT_HMAC_KEY ||
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'krypton_local_development_jwt_secret');
  if (!secret || secret.length < 32) {
    throw new Error('Configure USB_AUDIT_HMAC_KEY or a 32-character JWT_SECRET for audit integrity.');
  }
  return secret;
}

export function createUsbAuditHash(
  eventData: Record<string, unknown>,
  sequence: number,
  previousHash: string,
  secret: string,
): string {
  const canonicalEvent = JSON.stringify({ ...eventData, sequence, previousHash });
  return createHmac('sha256', secret).update(canonicalEvent).digest('hex');
}

export function verifyUsbAuditHash(storedHash: string, expectedHash: string): boolean {
  const stored = Buffer.from(storedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return stored.length === expected.length && timingSafeEqual(stored, expected);
}
