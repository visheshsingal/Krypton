import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { SecurityEvent } from '@/models/SecurityEvent';
import { authenticateRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.error || !auth.user || !auth.user.companyId) {
      return NextResponse.json({ error: 'Unauthenticated desktop agent' }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();
    const {
      deviceId,
      targetApp = 'Krypton Demonstration Sandbox',
      riskLevel,
      ruleCode,
      ruleName,
      category,
      actionTaken,
      explanation,
      timestamp,
    } = body;

    const device = await Device.findOne({ companyId: auth.user.companyId, deviceId });
    const deviceName = device ? device.deviceName : 'Desktop Workstation';

    const event = await SecurityEvent.create({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      userEmail: auth.user.email,
      userName: auth.user.name,
      deviceId,
      deviceName,
      targetApp,
      riskLevel: riskLevel || 'HIGH',
      ruleCode,
      ruleName,
      category: category || 'api_key',
      actionTaken: actionTaken || 'block',
      redactedPreview: '[Preview withheld; server-side secret scanning is not configured for this endpoint]',
      explanation: explanation || '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    return NextResponse.json({ message: 'Security incident ingested successfully', eventId: event._id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
