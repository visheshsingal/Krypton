import {
  buildPacScript,
  buildRegularBrowserBlockPage,
  hostMatchesProtectedDomain,
  normalizeProtectedAiDomain,
  resolveProtectedAiDomains,
  DEFAULT_PROTECTED_AI_DOMAINS,
} from './ai-site-catalog';

describe('AI site catalog', () => {
  test('normalizes admin-supplied hostnames and rejects junk', () => {
    expect(normalizeProtectedAiDomain('https://ChatGPT.com/chat')).toBe('chatgpt.com');
    expect(normalizeProtectedAiDomain('www.claude.ai.')).toBe('claude.ai');
    expect(normalizeProtectedAiDomain('not a domain')).toBeNull();
    expect(normalizeProtectedAiDomain('localhost')).toBeNull();
  });

  test('uses the supported default list when policy domains are absent', () => {
    expect(resolveProtectedAiDomains(undefined)).toEqual([...DEFAULT_PROTECTED_AI_DOMAINS]);
    expect(resolveProtectedAiDomains(['https://chatgpt.com', 'chatgpt.com', 'bad'])).toEqual(['chatgpt.com']);
  });

  test('matches apex and subdomains without treating shared-host siblings as equal', () => {
    expect(hostMatchesProtectedDomain('chatgpt.com', ['chatgpt.com'])).toBe(true);
    expect(hostMatchesProtectedDomain('chat.openai.chatgpt.com', ['chatgpt.com'])).toBe(true);
    expect(hostMatchesProtectedDomain('notchatgpt.com', ['chatgpt.com'])).toBe(false);
    expect(hostMatchesProtectedDomain('google.com', ['gemini.google.com'])).toBe(false);
  });

  test('PAC script proxies only configured hosts and leaves other traffic direct', () => {
    const pac = buildPacScript(18080, ['chatgpt.com']);
    expect(pac).toContain('PROXY 127.0.0.1:18080');
    expect(pac).toContain('chatgpt.com');
    expect(pac).toContain('return "DIRECT"');
  });

  test('escapes request-controlled host text in the local block page', () => {
    const page = buildRegularBrowserBlockPage('<script>alert(1)</script>', ['chatgpt.com']);
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
