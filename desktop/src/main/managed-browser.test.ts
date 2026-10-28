import { extractRequestText, isAiPromptRequestUrl } from './managed-browser';
import { PromptSecurityEngine } from '../engine/scanner';

describe('managed browser request inspection', () => {
  test('matches only supported HTTPS AI POST routes', () => {
    expect(isAiPromptRequestUrl('https://chatgpt.com/backend-api/conversation', 'POST')).toBe(true);
    expect(isAiPromptRequestUrl('https://api.openai.com/v1/responses', 'POST')).toBe(true);
    expect(isAiPromptRequestUrl('https://claude.ai/api/chat/completion', 'POST')).toBe(true);
    expect(isAiPromptRequestUrl('https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent', 'POST')).toBe(true);
    expect(isAiPromptRequestUrl('https://example.com/v1/chat/completions', 'POST')).toBe(false);
    expect(isAiPromptRequestUrl('https://gmail.googleapis.com/gmail/v1/users/me/messages', 'POST')).toBe(false);
    expect(isAiPromptRequestUrl('http://chatgpt.com/backend-api/conversation', 'POST')).toBe(false);
    expect(isAiPromptRequestUrl('https://chatgpt.com/backend-api/conversation', 'GET')).toBe(false);
    expect(isAiPromptRequestUrl('https://chatgpt.com/backend-api/session', 'POST')).toBe(false);
  });

  test('extracts nested request text for local scanning', () => {
    expect(extractRequestText(JSON.stringify({
      conversation: {
        messages: [{ content: { parts: ['prompt text', 'token value'] } }],
      },
    }))).toContain('prompt text');
  });

  test('scans non-JSON request bodies as text', () => {
    expect(extractRequestText('prompt with token=abc123')).toBe('prompt with token=abc123');
  });

  test('detects a high-risk secret inside a ChatGPT request body', () => {
    const body = JSON.stringify({
      messages: [{
        content: 'Please review this key: sk-proj-abc1234567890def1234567890ghij',
      }],
    });
    const scan = new PromptSecurityEngine().scan(extractRequestText(body));
    expect(scan.action).toBe('block');
    expect(scan.highestRisk).toBe('CRITICAL');
    expect(scan.redactedPrompt).not.toContain('sk-proj-abc1234567890def1234567890ghij');
  });
});
