import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Device } from '@/models/Device';
import { SecurityEvent } from '@/models/SecurityEvent';
import { authenticateRequest } from '@/lib/auth';

import { SecurityPolicy } from '@/models/SecurityPolicy';
import { PromptSecurityEngine } from '../../../../desktop/src/engine/scanner';

const riskLevels = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const actions = new Set(['allow', 'warn', 'block']);
const warningResponses = new Set(['proceeded', 'dismissed']);

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
      redactedPreview: rawRedactedPreview,
      timestamp,
      eventType,
      warningResponse,
    } = body;

    const isPromptSubmission = eventType === 'prompt_submission';
    if (
      (eventType !== undefined && eventType !== 'prompt_submission' && eventType !== 'security_detection') ||
      (isPromptSubmission && (
        typeof deviceId !== 'string' ||
        typeof riskLevel !== 'string' || !riskLevels.has(riskLevel) ||
        typeof actionTaken !== 'string' || !actions.has(actionTaken) ||
        (warningResponse !== undefined && !warningResponses.has(warningResponse)) ||
        (warningResponse === 'proceeded' && actionTaken !== 'warn') ||
        (warningResponse === 'dismissed' && actionTaken !== 'block')
      ))
    ) {
      return NextResponse.json({ error: 'Invalid AI submission metadata.' }, { status: 400 });
    }

    const deviceQuery: Record<string, unknown> = {
      companyId: auth.user.companyId,
      deviceId,
    };
    if (isPromptSubmission) {
      deviceQuery.userId = auth.user.id;
      deviceQuery.status = 'active';
    }
    const device = await Device.findOne(deviceQuery);
    if (isPromptSubmission && !device) {
      return NextResponse.json({ error: 'AI activity must come from an active device assigned to this account.' }, { status: 403 });
    }
    const deviceName = device ? device.deviceName : 'Desktop Workstation';

    if (isPromptSubmission) {
      const recentEventCount = await SecurityEvent.countDocuments({
        companyId: auth.user.companyId,
        deviceId,
        eventType: 'prompt_submission',
        timestamp: { $gt: new Date(Date.now() - 60 * 1000) },
      });
      if (recentEventCount >= 60) {
        return NextResponse.json({ error: 'AI activity reporting limit reached.' }, { status: 429 });
      }
    }

    let redactedPreview = '[No prompt preview captured]';
    if (isPromptSubmission || (typeof rawRedactedPreview === 'string' && rawRedactedPreview.trim().length > 0)) {
      const policy = await SecurityPolicy.findOne({ companyId: auth.user.companyId });
      if (policy?.redactedPromptLoggingEnabled === true && typeof rawRedactedPreview === 'string' && rawRedactedPreview.trim().length > 0) {
        const companyRules = policy.customRules.map((rule) => ({
          ruleCode: rule.ruleCode,
          name: rule.name,
          description: rule.description,
          category: rule.category,
          pattern: rule.pattern,
          riskLevel: rule.riskLevel,
          action: rule.action,
          isEnabled: rule.isEnabled,
          isBuiltIn: rule.isBuiltIn,
          explanation: rule.explanation,
        }));
        redactedPreview = new PromptSecurityEngine(companyRules).scan(rawRedactedPreview).redactedPrompt.slice(0, 4_000);
      }
    }

    const event = await SecurityEvent.create({
      companyId: auth.user.companyId,
      userId: auth.user.id,
      userEmail: auth.user.email,
      userName: auth.user.name,
      deviceId,
      deviceName,
      targetApp,
      eventType: isPromptSubmission ? 'prompt_submission' : 'security_detection',
      riskLevel: riskLevel || 'HIGH',
      ruleCode,
      ruleName,
      ...(typeof category === 'string' ? { category } : !isPromptSubmission ? { category: 'api_key' } : {}),
      actionTaken: actionTaken || 'block',
      ...(warningResponse === 'proceeded' || warningResponse === 'dismissed' ? { warningResponse } : {}),
      redactedPreview,
      explanation: explanation || '',
      timestamp: isPromptSubmission ? new Date() : timestamp ? new Date(timestamp) : new Date(),
    });

    return NextResponse.json({ message: 'Security incident ingested successfully', eventId: event._id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
