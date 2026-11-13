import { PromptSecurityEngine } from './scanner';
import { SecurityPolicyDTO } from '@krypton/shared';

function createPolicy(overrides: Partial<SecurityPolicyDTO> = {}): SecurityPolicyDTO {
  return {
    companyId: 'company-test',
    blockCriticalRisk: true,
    blockHighRisk: true,
    warnMediumRisk: true,
    allowLowRisk: true,
    allowEmployeeBypassWarning: true,
    enablePiiDetection: true,
    enableSecretDetection: true,
    enableCustomRules: true,
    customRules: [],
    maxDevicesPerUser: 2,
    offlineGracePeriodHours: 72,
    fullPromptLoggingEnabled: false,
    ...overrides,
  };
}

describe('AI Prompt Security Engine - Local Deterministic Scanner', () => {
  const engine = new PromptSecurityEngine();

  test('1. Allows safe prompts without secrets', () => {
    const result = engine.scan('Can you explain the difference between REST and GraphQL in software architecture?');
    expect(result.hasRisk).toBe(false);
    expect(result.action).toBe('allow');
    expect(result.matches).toHaveLength(0);
    expect(result.redactedPrompt).toBe('Can you explain the difference between REST and GraphQL in software architecture?');
  });

  test('2. Detects and blocks OpenAI API Key with full redaction', () => {
    const prompt = 'Please review my script: const client = new OpenAI({ apiKey: "sk-proj-abc1234567890def1234567890ghij" });';
    const result = engine.scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.highestRisk).toBe('CRITICAL');
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('API_KEY_OPENAI');
    expect(result.redactedPrompt).not.toContain('sk-proj-abc1234567890def1234567890ghij');
    expect(result.redactedPrompt).toContain('[REDACTED: API_KEY_OPENAI]');
  });

  test('3. Detects and blocks Anthropic API Key', () => {
    const prompt = 'Anthropic client init: client = anthropic.Anthropic(api_key="sk-ant-api03-abcdef1234567890abcdef1234567890")';
    const result = engine.scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('API_KEY_ANTHROPIC');
    expect(result.redactedPrompt).toContain('[REDACTED: API_KEY_ANTHROPIC]');
  });

  test('4. Detects and blocks AWS Access Key', () => {
    const prompt = 'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const result = engine.scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('CLOUD_AWS_KEY');
    expect(result.redactedPrompt).toContain('[REDACTED: CLOUD_AWS_KEY]');
  });

  test('5. Detects and blocks Database Connection URI with credentials', () => {
    const prompt = 'Connecting to postgres://admin:SuperSecretPassword123@db.prod.internal:5432/finance_db';
    const result = engine.scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('CONN_STRING_DB');
    expect(result.redactedPrompt).not.toContain('SuperSecretPassword123');
    expect(result.redactedPrompt).toContain('[REDACTED: CONN_STRING_DB]');
  });

  test('6. Detects and blocks Private Keys', () => {
    const prompt = 'Here is the server SSL key: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    const result = engine.scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('PRIVATE_KEY');
    expect(result.redactedPrompt).toContain('[REDACTED: PRIVATE_KEY]');
  });

  test('7. Detects and blocks Plaintext Password assignments', () => {
    const prompt = 'Please debug why login fails: password="ProductionRootPassword2026!"';
    const result = engine.scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('PASSWORD_IN_PROMPT');
    expect(result.redactedPrompt).toContain('[REDACTED: PASSWORD_IN_PROMPT]');
  });

  test('8. Supports company custom rules and keywords', () => {
    const customEngine = new PromptSecurityEngine([
      {
        ruleCode: 'CUSTOM_PROJECT_APOLLO',
        name: 'Project Apollo Confidential',
        description: 'Internal confidential codename',
        category: 'custom_keyword',
        pattern: 'project-apollo|apollo_internal_kernel',
        riskLevel: 'HIGH',
        action: 'block',
        isEnabled: true,
        isBuiltIn: false,
        explanation: 'Project Apollo trade secret cannot be shared externally.',
      },
    ]);

    const result = customEngine.scan('Can you summarize project-apollo architecture?');
    expect(result.hasRisk).toBe(true);
    expect(result.action).toBe('block');
    expect(result.matches[0].ruleCode).toBe('CUSTOM_PROJECT_APOLLO');
    expect(result.redactedPrompt).toContain('[REDACTED: CUSTOM_PROJECT_APOLLO]');
  });

  test.each([
    ['email address', 'Contact test@example.com about the sample request.', 'PII_EMAIL'],
    ['phone number in a sentence', 'My phone number is +1 (202) 555-0147.', 'PII_PHONE'],
    ['birth date in a sentence', 'Their date of birth is 1990-04-15.', 'PII_DATE_OF_BIRTH'],
    ['street address in a sentence', 'Their home address is 123 Example Street.', 'PII_POSTAL_ADDRESS'],
  ])('warns for medium-risk %s instead of blocking', (_label, prompt, ruleCode) => {
    const result = new PromptSecurityEngine().scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.highestRisk).toBe('MEDIUM');
    expect(result.action).toBe('warn');
    expect(result.matches.map((match) => match.ruleCode)).toContain(ruleCode);
  });

  test.each([
    'My account number is this 6465745724872. Write me an email about it.',
    'Please email the bank account: 6465745724872',
    'My account no. is 6465 7457 2487 2; can you format this?',
    'Send a note about acct # 6465-7457-2487-2.',
    'The a/c number is 6465745724872',
  ])('blocks and redacts conversational bank account details: %s', (prompt) => {
    const result = new PromptSecurityEngine().scan(prompt);

    expect(result.hasRisk).toBe(true);
    expect(result.highestRisk).toBe('HIGH');
    expect(result.action).toBe('block');
    expect(result.matches.map((match) => match.ruleCode)).toContain('PII_BANK_ACCOUNT');
    expect(result.redactedPrompt).not.toContain('6465745724872');
    expect(result.redactedPrompt).not.toContain('6465 7457 2487 2');
  });

  test.each([
    'The order reference is 6465745724872; please check its status.',
    'Generate a report for the 123456789012 batch.',
    'What is the result of 6465745724872 divided by 2?',
  ])('does not block an unlabelled number without account context: %s', (prompt) => {
    const result = new PromptSecurityEngine().scan(prompt);
    expect(result.hasRisk).toBe(false);
    expect(result.action).toBe('allow');
  });

  test('detects a payment card number when written with spaces', () => {
    const prompt = 'Please use this card number: 4111 1111 1111 1111';
    const result = new PromptSecurityEngine().scan(prompt);

    expect(result.action).toBe('block');
    expect(result.matches.map((match) => match.ruleCode)).toContain('PII_CREDIT_CARD');
    expect(result.redactedPrompt).not.toContain('4111 1111 1111 1111');
  });

  test('applies each severity policy and allows clean prompts', () => {
    const policyEngine = new PromptSecurityEngine([], createPolicy());
    expect(policyEngine.scan('Please review key sk-proj-abc1234567890def1234567890ghij').action).toBe('block');
    expect(policyEngine.scan('Contact test@example.com').action).toBe('warn');
    expect(policyEngine.scan('Explain how a REST API works.').action).toBe('allow');
  });

  test('disabled critical, high, and medium enforcement allows those matches', () => {
    const policyEngine = new PromptSecurityEngine([], createPolicy({
      blockCriticalRisk: false,
      blockHighRisk: false,
      warnMediumRisk: false,
    }));

    expect(policyEngine.scan('Secret key sk-proj-abc1234567890def1234567890ghij').action).toBe('allow');
    expect(policyEngine.scan('My account number is 6465745724872').action).toBe('allow');
    expect(policyEngine.scan('Contact test@example.com').action).toBe('allow');
  });

  test('does not let a disabled critical rule suppress an enabled medium warning', () => {
    const policyEngine = new PromptSecurityEngine([], createPolicy({ blockCriticalRisk: false }));

    const result = policyEngine.scan(
      'Contact test@example.com about secret key sk-proj-abc1234567890def1234567890ghij',
    );

    expect(result.highestRisk).toBe('CRITICAL');
    expect(result.action).toBe('warn');
  });

  test('disabling allow-low-risk enforcement blocks low-risk matches', () => {
    const lowRiskRule = {
      ruleCode: 'CUSTOM_LOW',
      name: 'Low-risk test rule',
      description: 'Test low-risk policy behavior',
      category: 'custom_keyword' as const,
      pattern: 'internal-tag',
      riskLevel: 'LOW' as const,
      action: 'allow' as const,
      isEnabled: true,
      isBuiltIn: false,
      explanation: 'Low-risk test match.',
    };
    const policyEngine = new PromptSecurityEngine([], createPolicy({
      allowLowRisk: false,
      customRules: [lowRiskRule],
    }));

    expect(policyEngine.scan('internal-tag').action).toBe('block');
  });

  test('exposes the company warning-bypass setting to desktop and extension enforcement', () => {
    expect(new PromptSecurityEngine([], createPolicy()).allowsEmployeeWarningBypass()).toBe(true);
    expect(new PromptSecurityEngine([], createPolicy({
      allowEmployeeBypassWarning: false,
    })).allowsEmployeeWarningBypass()).toBe(false);
    expect(new PromptSecurityEngine().allowsEmployeeWarningBypass()).toBe(true);
  });
});
