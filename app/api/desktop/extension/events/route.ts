import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { sha256, validateExtensionEntitlement } from '@/lib/extension-licensing';
import { BrowserExtensionSession } from '@/models/BrowserExtensionSession';
import { SecurityEvent } from '@/models/SecurityEvent';
import { SecurityPolicy } from '@/models/SecurityPolicy';
import { User } from '@/models/User';
import { PromptSecurityEngine } from '../../../../../desktop/src/engine/scanner';

const riskLevels = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const categories = new Set([
  'api_key', 'private_key', 'password', 'connection_string',
  'cloud_credential', 'pii', 'custom_keyword', 'custom_regex',
]);
const actions = new Set(['block', 'warn']);

function isRiskLevel(value: unknown): value is 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  return typeof value === 'string' && riskLevels.has(value);
}

function isCategory(value: unknown): value is
  | 'api_key'
  | 'private_key'
  | 'password'
  | 'connection_string'
  | 'cloud_credential'
  | 'pii'
  | 'custom_keyword'
  | 'custom_regex' {
  return typeof value === 'string' && categories.has(value);
}

function isAction(value: unknown): value is 'allow' | 'block' | 'warn' {
  return typeof value === 'string' && (value === 'allow' || actions.has(value));
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const bearer = req.headers.get('authorization');
    const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
    const session = token.length >= 32 && token.length <= 200
      ? await BrowserExtensionSession.findOne({
          sessionTokenHash: sha256(token),
          status: 'active',
          sessionExpiresAt: { $gt: new Date() },
        }).select('+sessionTokenHash')
      : null;
    if (!session) {
      return NextResponse.json({ error: 'Extension session expired or revoked.' }, { status: 401 });
    }

    const entitlement = await validateExtensionEntitlement({
      companyId: session.companyId.toString(),
      userId: session.userId.toString(),
      deviceId: session.desktopDeviceId,
    });
    if (!entitlement.valid) {
      return NextResponse.json({ error: 'License or device is no longer authorized.' }, { status: 403 });
    }

    const value: unknown = await req.json().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return NextResponse.json({ error: 'Invalid blocked-event metadata.' }, { status: 400 });
    }
    const body = value as Record<string, unknown>;
    const isPromptSubmission = body.eventType === 'prompt_submission';
    if (
      typeof body.ruleCode !== 'string' ||
      typeof body.ruleName !== 'string' ||
      !isRiskLevel(body.riskLevel) ||
      (body.category !== undefined && !isCategory(body.category)) ||
      (!isPromptSubmission && !isCategory(body.category)) ||
      !isAction(body.actionTaken)
    ) {
      return NextResponse.json({ error: 'Invalid blocked-event metadata.' }, { status: 400 });
    }
    if (isPromptSubmission && body.actionTaken !== 'allow' && body.actionTaken !== 'block') {
      return NextResponse.json({ error: 'Invalid prompt submission outcome.' }, { status: 400 });
    }

    const promptPreview = typeof body.redactedPreview === 'string' ? body.redactedPreview : '';
    if (promptPreview.length > 10_000) {
      return NextResponse.json({ error: 'Prompt preview is too long.' }, { status: 400 });
    }

    const policy = await SecurityPolicy.findOne({ companyId: session.companyId });
    const promptLoggingEnabled = policy?.redactedPromptLoggingEnabled === true;
    if (isPromptSubmission && body.actionTaken === 'allow' && !promptLoggingEnabled) {
      return NextResponse.json({ accepted: false, reason: 'prompt_logging_disabled' });
    }

    const hostname = typeof body.hostname === 'string' ? body.hostname.toLowerCase() : '';
    let safeHost = 'AI website';
    try {
      const parsed = new URL(`https://${hostname}`);
      if (parsed.hostname !== hostname || parsed.username || parsed.password) throw new Error('Invalid hostname');
      const allowedHosts = [
        'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com',
        'gemini.google.com', 'copilot.microsoft.com', 'bing.com', 'perplexity.ai',
      ];
      if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
        throw new Error('Unsupported event host');
      }
      safeHost = parsed.hostname.slice(0, 100);
    } catch {
      return NextResponse.json({ error: 'Invalid event hostname.' }, { status: 400 });
    }

    const user = await User.findById(session.userId).select('email name');
    const recentEventCount = await SecurityEvent.countDocuments({
      companyId: session.companyId,
      deviceId: session.desktopDeviceId,
      deviceName: 'Krypton Browser Extension',
      timestamp: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (recentEventCount >= 60) {
      return NextResponse.json({ error: 'Extension event rate limit reached.' }, { status: 429 });
    }

    let redactedPreview = '[Prompt withheld; sensitive content blocked locally]';
    if (isPromptSubmission && promptLoggingEnabled && promptPreview) {
      const companyRules = policy?.customRules.map((rule) => ({
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
      })) || [];
      redactedPreview = new PromptSecurityEngine(companyRules).scan(promptPreview).redactedPrompt.slice(0, 4_000);
    }
    await SecurityEvent.create({
      companyId: session.companyId,
      userId: session.userId,
      deviceId: session.desktopDeviceId,
      userEmail: user?.email || '',
      userName: user?.name || '',
      deviceName: 'Krypton Browser Extension',
      targetApp: `${safeHost} (Krypton Extension)`,
      riskLevel: body.riskLevel,
      ruleCode: body.ruleCode.slice(0, 100),
      ruleName: body.ruleName.slice(0, 200),
      ...(isCategory(body.category) ? { category: body.category } : {}),
      actionTaken: body.actionTaken,
      redactedPreview,
      explanation: typeof body.explanation === 'string' ? body.explanation.slice(0, 1000) : '',
      timestamp: new Date(),
    });

    return NextResponse.json({ accepted: true }, { status: 201 });
  } catch (error) {
    console.error('[ExtensionEvents] Could not record blocked event:', error);
    return NextResponse.json({ error: 'Could not record blocked event.' }, { status: 500 });
  }
}
