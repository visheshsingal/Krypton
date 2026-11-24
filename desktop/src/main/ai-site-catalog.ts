export const DEFAULT_PROTECTED_AI_DOMAINS = [
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'perplexity.ai',
] as const;

const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function normalizeProtectedAiDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  candidate = candidate.replace(/^https?:\/\//, '');
  candidate = candidate.split('/')[0] || '';
  candidate = candidate.replace(/\.$/, '');
  if (candidate.startsWith('www.')) candidate = candidate.slice(4);
  if (candidate.length > 253 || !HOSTNAME_PATTERN.test(candidate)) return null;
  return candidate;
}

export function resolveProtectedAiDomains(policyDomains: unknown): string[] {
  const source = Array.isArray(policyDomains) && policyDomains.length > 0
    ? policyDomains
    : DEFAULT_PROTECTED_AI_DOMAINS;
  const unique = new Set<string>();
  for (const entry of source) {
    const domain = normalizeProtectedAiDomain(entry);
    if (domain) unique.add(domain);
  }
  return [...unique];
}

export function hostMatchesProtectedDomain(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function buildPacScript(port: number, domains: readonly string[]): string {
  const serialized = JSON.stringify(domains.map((domain) => domain.toLowerCase()));
  return `function FindProxyForURL(url, host) {
  host = (host || "").toLowerCase();
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") return "DIRECT";
  var blocked = ${serialized};
  for (var i = 0; i < blocked.length; i++) {
    var domain = blocked[i];
    if (host === domain || dnsDomainIs(host, "." + domain)) {
      return "PROXY 127.0.0.1:${port}";
    }
  }
  return "DIRECT";
}
`;
}

export function buildRegularBrowserBlockPage(hostname: string, domains: readonly string[]): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => htmlEntities[character] || character);
  const host = escapeHtml(hostname || 'this AI website');
  const list = domains.map((domain) => `<li>${escapeHtml(domain)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Krypton blocked this site</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b1220; color: #e2e8f0; margin: 0; padding: 48px 24px; }
    main { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 28px; }
    p { line-height: 1.6; color: #94a3b8; }
    code { color: #67e8f9; }
    ul { color: #cbd5e1; }
  </style>
</head>
<body>
  <main>
    <h1>This AI website is blocked in regular Chrome/Edge</h1>
    <p><code>${host}</code> is on your company's protected AI domain list. During the administrator-configured protection hours, Krypton stops this site in ordinary Chrome and Edge.</p>
    <p>Open the same site from <strong>Krypton Guard</strong> using <strong>Open protected Chrome</strong> or <strong>Open Edge</strong>. Prompt inspection runs only in that isolated Krypton profile.</p>
    <p>Configured domains:</p>
    <ul>${list}</ul>
    <p>This is not a universal web filter. Other browsers, VPNs, portable browsers, and local administrators can bypass user-level proxy settings.</p>
  </main>
</body>
</html>`;
}
