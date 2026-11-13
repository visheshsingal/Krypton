import {
  DetectionCategory,
  DetectionRuleDTO,
  EnforcementAction,
  PromptScanMatch,
  PromptScanResult,
  RiskLevel,
  SecurityPolicyDTO,
} from '@krypton/shared';
import { BUILT_IN_RULES } from './rules';

export class PromptSecurityEngine {
  private rules: DetectionRuleDTO[];
  private policy: SecurityPolicyDTO | null;

  constructor(customRules: DetectionRuleDTO[] = [], policy: SecurityPolicyDTO | null = null) {
    this.policy = policy;
    this.rules = [...BUILT_IN_RULES, ...(policy?.customRules || customRules)];
  }

  public updatePolicy(policy: SecurityPolicyDTO): void {
    this.policy = policy;
    const customRules = policy.customRules || [];
    this.rules = [...BUILT_IN_RULES, ...customRules];
  }

  public allowsEmployeeWarningBypass(): boolean {
    return this.policy?.allowEmployeeBypassWarning !== false;
  }

  public scan(prompt: string): PromptScanResult {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        hasRisk: false,
        highestRisk: 'LOW',
        action: 'allow',
        matches: [],
        redactedPrompt: prompt || '',
        explanation: 'Prompt is empty.',
      };
    }

    const rawMatches: Array<{
      start: number;
      end: number;
      matchedText: string;
      rule: DetectionRuleDTO;
    }> = [];

    // Evaluate each rule
    for (const rule of this.rules) {
      if (!rule.isEnabled) continue;

      // Check category toggles if policy is present
      if (this.policy) {
        if (rule.category === 'pii' && !this.policy.enablePiiDetection) continue;
        if (
          (rule.category === 'api_key' ||
            rule.category === 'private_key' ||
            rule.category === 'cloud_credential' ||
            rule.category === 'connection_string' ||
            rule.category === 'password') &&
          !this.policy.enableSecretDetection
        ) {
          continue;
        }
        if (
          (rule.category === 'custom_keyword' || rule.category === 'custom_regex') &&
          !this.policy.enableCustomRules
        ) {
          continue;
        }
      }

      if (!rule.pattern) continue;

      try {
        const regex = new RegExp(rule.pattern, 'gi');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(prompt)) !== null) {
          // Avoid infinite loops on zero-width matches
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }

          const matchedText = match[0];
          const start = match.index;
          const end = start + matchedText.length;

          // Perform extra false-positive verification for specific categories
          if (this.isFalsePositive(matchedText, rule, prompt, start)) {
            continue;
          }

          rawMatches.push({
            start,
            end,
            matchedText,
            rule,
          });
        }
      } catch (err) {
        console.warn(`[SecurityEngine] Invalid regex pattern for rule ${rule.ruleCode}:`, err);
      }
    }

    // Sort matches in ascending start position
    rawMatches.sort((a, b) => a.start - b.start);

    // Filter overlapping matches (keep earlier or higher risk match)
    const nonOverlapping: typeof rawMatches = [];
    let lastEnd = -1;

    for (const m of rawMatches) {
      if (m.start >= lastEnd) {
        nonOverlapping.push(m);
        lastEnd = m.end;
      }
    }

    // If no matches found
    if (nonOverlapping.length === 0) {
      return {
        hasRisk: false,
        highestRisk: 'LOW',
        action: 'allow',
        matches: [],
        redactedPrompt: prompt,
        explanation: 'No sensitive data, secret tokens, or compliance violations detected.',
      };
    }

    // Determine highest risk level
    const riskPriority: Record<RiskLevel, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    let highestRisk: RiskLevel = 'LOW';
    for (const m of nonOverlapping) {
      if (riskPriority[m.rule.riskLevel] > riskPriority[highestRisk]) {
        highestRisk = m.rule.riskLevel;
      }
    }

    const actionPriority: Record<EnforcementAction, number> = {
      allow: 0,
      warn: 1,
      block: 2,
    };
    const actions = nonOverlapping.map(({ rule }) => {
      if (!this.policy) return rule.action;
      switch (rule.riskLevel) {
        case 'CRITICAL':
          return this.policy.blockCriticalRisk ? 'block' : 'allow';
        case 'HIGH':
          return this.policy.blockHighRisk ? 'block' : 'allow';
        case 'MEDIUM':
          return this.policy.warnMediumRisk ? 'warn' : 'allow';
        case 'LOW':
          return this.policy.allowLowRisk ? 'allow' : 'block';
      }
    });
    const finalAction = actions.reduce<EnforcementAction>(
      (action, candidate) => actionPriority[candidate] > actionPriority[action] ? candidate : action,
      'allow',
    );

    // Construct redacted prompt and match list
    // Replace from end to start so character indices don't shift
    let redactedPrompt = prompt;
    const formattedMatches: PromptScanMatch[] = [];

    for (let i = nonOverlapping.length - 1; i >= 0; i--) {
      const item = nonOverlapping[i];
      const placeholder = `[REDACTED: ${item.rule.ruleCode}]`;

      redactedPrompt =
        redactedPrompt.slice(0, item.start) +
        placeholder +
        redactedPrompt.slice(item.end);

      formattedMatches.unshift({
        ruleCode: item.rule.ruleCode,
        ruleName: item.rule.name,
        category: item.rule.category,
        riskLevel: item.rule.riskLevel,
        action: item.rule.action,
        explanation: item.rule.explanation,
        start: item.start,
        end: item.end,
        redactedText: placeholder,
      });
    }

    const explanations = Array.from(new Set(formattedMatches.map((m) => m.explanation))).join(' ');

    return {
      hasRisk: true,
      highestRisk,
      action: finalAction,
      matches: formattedMatches,
      redactedPrompt,
      explanation: explanations,
    };
  }

  /**
   * Domain-specific false positive checking
   */
  private isFalsePositive(text: string, rule: DetectionRuleDTO, prompt: string, start: number): boolean {
    if (rule.ruleCode === 'PII_CREDIT_CARD') {
      const digitsOnly = text.replace(/\D/g, '');
      if (digitsOnly.length < 13 || digitsOnly.length > 19) return true;
      // Luhn checksum test
      if (!this.luhnCheck(digitsOnly)) return true;
    }

    if (rule.ruleCode === 'PII_SSN') {
      // Reject dummy SSNs like 000-xx-xxxx or 666-xx-xxxx
      if (text.startsWith('000') || text.startsWith('666') || text.startsWith('9')) {
        return true;
      }
    }

    if (rule.ruleCode === 'PII_BANK_ACCOUNT') {
      const context = prompt.slice(Math.max(0, start - 80), start);
      const accountLabel = /(?:\bbank\s+account\b|\baccount\s*(?:number|no\.?|num(?:ber)?)\b|\baccount\s*#|\bacct\s*(?:number|no\.?)\b|\bacct\s*#|\ba\/c(?:\s*(?:number|no\.?))?\b)/i;
      const labelMatch = context.match(accountLabel);
      if (!labelMatch) return true;
      const textAfterLabel = context.slice((labelMatch.index || 0) + labelMatch[0].length);
      if (/\d/.test(textAfterLabel) || textAfterLabel.length > 48) return true;
    }

    return false;
  }

  private luhnCheck(digits: string): boolean {
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }
}
