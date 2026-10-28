import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { Company } from '@/models/Company';
import { Device } from '@/models/Device';
import { License } from '@/models/License';

export async function getOwnedActiveDevice(req: NextRequest, deviceId: unknown, requireLicense = true) {
  const auth = await authenticateRequest(req);
  if (auth.error || !auth.user || !['employee', 'company_admin'].includes(auth.user.role) || !auth.user.companyId) {
    return { response: NextResponse.json({ error: 'Authenticated company device required.' }, { status: 403 }) };
  }
  if (typeof deviceId !== 'string' || deviceId.length < 1 || deviceId.length > 128) {
    return { response: NextResponse.json({ error: 'A valid deviceId is required.' }, { status: 400 }) };
  }

  await connectDB();
  const [company, device, license] = await Promise.all([
    Company.findById(auth.user.companyId).select('status'),
    Device.findOne({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      deviceId,
      status: 'active',
    }),
    requireLicense
      ? License.findOne({
          companyId: auth.user.companyId,
          status: 'active',
          expiresAt: { $gt: new Date() },
        }).select('status expiresAt')
      : Promise.resolve(null),
  ]);
  if (!company || company.status !== 'active') {
    return { response: NextResponse.json({ error: 'Company workspace is inactive.' }, { status: 403 }) };
  }
  if (!device) {
    return { response: NextResponse.json({ error: 'Active device not found for this employee.' }, { status: 403 }) };
  }
  if (requireLicense && !license) {
    return { response: NextResponse.json({ error: 'An active company license is required.' }, { status: 403 }) };
  }
  return { user: auth.user, device };
}

export async function readSmallJson(req: NextRequest): Promise<{ body?: unknown; response?: NextResponse }> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 16 * 1024) {
    return { response: NextResponse.json({ error: 'Request body is too large.' }, { status: 413 }) };
  }
  if (!req.body) {
    return { response: NextResponse.json({ error: 'Request body is required.' }, { status: 400 }) };
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 16 * 1024) {
        await reader.cancel();
        return { response: NextResponse.json({ error: 'Request body is too large.' }, { status: 413 }) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
  } catch {
    return { response: NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) };
  }
}
