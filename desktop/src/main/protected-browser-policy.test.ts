import {
  createBlockedPromptEvent,
  createPromptSubmissionEvent,
  getOfflineProtectionState,
  isProtectedAiSite,
  isRiskAtLeast,
} from './protected-browser-policy';
import { PromptScanResult } from '@krypton/shared';

const blockedResult: PromptScanResult = {
  hasRisk: true,
  highestRisk: 'CRITICAL',
  action: 'block',
  matches: [{
    ruleCode: 'API_KEY_OPENAI',
    ruleName: 'OpenAI Secret Key',
    category: 'api_key',
    riskLevel: 'CRITICAL',
    action: 'block',
    explanation: 'Secret detected.',
    start: 10,
    end: 48,
    redactedText: '[REDACTED: API_KEY_OPENAI]',
  }],
  redactedPrompt: 'Prompt with [REDACTED: API_KEY_OPENAI]',
  explanation: 'Secret detected.',
};

describe('Windows protected browser policy helpers', () => {
  test('allows only known AI provider launch targets', () => {
    expect(isProtectedAiSite('chatgpt')).toBe(true);
    expect(isProtectedAiSite('claude')).toBe(true);
    expect(isProtectedAiSite('https://attacker.example')).toBe(false);
    expect(isProtectedAiSite(null)).toBe(false);
  });

  test('creates an incident payload with sanitized prompt and without raw secret', () => {
    const event = createBlockedPromptEvent(blockedResult, 'chatgpt.com', '2026-10-28T00:00:00.000Z');
    expect(event).toMatchObject({
      targetApp: 'chatgpt.com (Krypton Managed Browser)',
      actionTaken: 'block',
      redactedPreview: 'Prompt with [REDACTED: API_KEY_OPENAI]',
      timestamp: '2026-10-28T00:00:00.000Z',
    });
    expect(JSON.stringify(event)).toContain('Prompt with [REDACTED: API_KEY_OPENAI]');
    expect(JSON.stringify(event)).not.toContain('sk-');
  });

  test('does not report allowed or unmatched content as a block', () => {
    expect(createBlockedPromptEvent({ ...blockedResult, action: 'allow' }, 'chatgpt.com')).toBeNull();
    expect(createBlockedPromptEvent({ ...blockedResult, matches: [] }, 'chatgpt.com')).toBeNull();
  });

  test('records clean AI use as metadata without collecting prompt text', () => {
    const cleanResult: PromptScanResult = {
      hasRisk: false,
      highestRisk: 'LOW',
      action: 'allow',
      matches: [],
      redactedPrompt: 'This prompt must not be stored.',
      explanation: '',
    };
    const event = createPromptSubmissionEvent(
      cleanResult,
      'chatgpt.com',
      'allow',
      undefined,
      '2026-10-28T00:00:00.000Z',
    );
    expect(event).toMatchObject({
      eventType: 'prompt_submission',
      riskLevel: 'LOW',
      actionTaken: 'allow',
    });
    expect(event).not.toHaveProperty('redactedPreview');
    expect(JSON.stringify(event)).not.toContain('This prompt must not be stored.');
  });

  test('records whether an employee dismissed or proceeded after a warning', () => {
    const dismissed = createPromptSubmissionEvent(
      { ...blockedResult, action: 'warn', highestRisk: 'MEDIUM' },
      'chatgpt.com',
      'block',
      'dismissed',
    );
    expect(dismissed).toMatchObject({
      eventType: 'prompt_submission',
      actionTaken: 'block',
      warningResponse: 'dismissed',
    });
  });

  test('keeps license offline grace bounded and rejects invalid timestamps', () => {
    const now = Date.parse('2026-10-28T00:00:00.000Z');
    expect(getOfflineProtectionState('2026-10-27T23:00:00.000Z', 2, now)).toBe('valid');
    expect(getOfflineProtectionState('2026-10-27T00:00:00.000Z', 2, now)).toBe('expired');
    expect(getOfflineProtectionState('not-a-date', 72, now)).toBe('expired');
    expect(getOfflineProtectionState(undefined, 72, now)).toBe('expired');
  });

  test('compares risk levels in severity order', () => {
    expect(isRiskAtLeast('CRITICAL', 'HIGH')).toBe(true);
    expect(isRiskAtLeast('MEDIUM', 'HIGH')).toBe(false);
    expect(isRiskAtLeast('invalid', 'LOW')).toBe(false);
  });
});
