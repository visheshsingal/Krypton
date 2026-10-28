import { PromptScanResult } from '@krypton/shared';

export const PROTECTED_AI_SITES = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Claude', url: 'https://claude.ai/' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/' },
  copilot: { name: 'Copilot', url: 'https://copilot.microsoft.com/' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/' },
} as const;

export type ProtectedAiSite = keyof typeof PROTECTED_AI_SITES;

const riskOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
const allowedCategories = new Set([
  'api_key',
  'private_key',
  'password',
  'connection_string',
  'cloud_credential',
  'pii',
  'custom_keyword',
  'custom_regex',
]);

export function isProtectedAiSite(value: unknown): value is ProtectedAiSite {
  return typeof value === 'string' && Object.hasOwn(PROTECTED_AI_SITES, value);
}

export function createBlockedPromptEvent(
  result: PromptScanResult,
  hostname: string,
  timestamp = new Date().toISOString(),
) {
  if (!result.hasRisk || result.action !== 'block' || result.matches.length === 0) return null;

  const primaryMatch = result.matches[0];
  if (!allowedCategories.has(primaryMatch.category)) return null;

  return {
    targetApp: `${hostname} (Krypton Managed Browser)`.slice(0, 100),
    riskLevel: result.highestRisk,
    ruleCode: primaryMatch.ruleCode.slice(0, 100),
    ruleName: primaryMatch.ruleName.slice(0, 200),
    category: primaryMatch.category,
    actionTaken: 'block' as const,
    redactedPreview: '[Prompt withheld; sensitive content blocked locally]',
    explanation: primaryMatch.explanation.slice(0, 1000),
    timestamp,
  };
}

export function getOfflineProtectionState(
  lastSuccessfulValidation: string | undefined,
  graceHours: number,
  now = Date.now(),
): 'valid' | 'expired' {
  if (!lastSuccessfulValidation) return 'expired';
  const validatedAt = Date.parse(lastSuccessfulValidation);
  if (!Number.isFinite(validatedAt) || validatedAt > now) return 'expired';
  return now - validatedAt <= graceHours * 60 * 60 * 1000 ? 'valid' : 'expired';
}

export function isRiskAtLeast(
  risk: string,
  minimum: keyof typeof riskOrder,
): boolean {
  return Object.hasOwn(riskOrder, risk) &&
    riskOrder[risk as keyof typeof riskOrder] >= riskOrder[minimum];
}
