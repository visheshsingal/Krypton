import { PromptSecurityEngine } from '../../src/engine/scanner';
import { SecurityPolicyDTO } from '@krypton/shared';

type ExtensionState = {
  authorized: boolean;
  policy?: SecurityPolicyDTO | null;
};

const engine = new PromptSecurityEngine();
const selector = 'textarea, [contenteditable="true"], [role="textbox"]';
let authorized = false;
let currentPolicy: SecurityPolicyDTO | null = null;
let confirmationOpen = false;
let banner: HTMLDivElement | null = null;
let approvedWarning: { prompt: string; expiresAt: number } | null = null;
let lastReportedSubmission: { key: string; at: number } | null = null;

function requestState(): void {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state?: ExtensionState) => {
    if (chrome.runtime.lastError || !state) {
      authorized = false;
      return;
    }
    authorized = state.authorized;
    if (state.policy) {
      currentPolicy = state.policy;
      engine.updatePolicy(state.policy);
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'STATE_CHANGED') requestState();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.authorized) authorized = changes.authorized.newValue === true;
  if (changes.policy?.newValue) {
    currentPolicy = changes.policy.newValue as SecurityPolicyDTO;
    engine.updatePolicy(currentPolicy);
  }
});

function visible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function editorText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement) return element.value;
  return element.innerText || element.textContent || '';
}

function findEditor(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof Element ? target : null;
  const form = element?.closest('form');
  if (element instanceof HTMLElement && element.matches(selector)) return element;
  if (form) {
    const formEditor = Array.from(form.querySelectorAll<HTMLElement>(selector)).find(visible);
    if (formEditor) return formEditor;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(selector)) return active;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(visible).at(-1) || null;
}

function showBanner(ruleNames: string[]): void {
  if (!banner || !banner.isConnected) {
    banner = document.createElement('div');
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:400px;padding:14px 18px;border:1px solid #ef4444;border-radius:12px;background:#111827;color:#f8fafc;box-shadow:0 12px 40px #0009;font:14px/1.5 system-ui,sans-serif';
    const heading = document.createElement('strong');
    heading.textContent = 'Krypton blocked this submission';
    const description = document.createElement('p');
    description.textContent = 'Sensitive content was detected locally. Remove it before submitting.';
    description.style.marginBottom = '0';
    const list = document.createElement('ul');
    banner.append(heading, description, list);
    (document.body || document.documentElement).append(banner);
  }
  const list = banner.querySelector('ul');
  if (!list) return;
  list.replaceChildren(...ruleNames.map((name) => {
    const item = document.createElement('li');
    item.textContent = name;
    return item;
  }));
}

function cancel(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function reportSubmission(
  result: ReturnType<PromptSecurityEngine['scan']>,
  prompt: string,
  outcome: 'allow' | 'block',
): void {
  const loggingEnabled = currentPolicy?.redactedPromptLoggingEnabled === true;
  if (outcome === 'allow' && !loggingEnabled) return;

  const now = Date.now();
  const key = `${outcome}:${prompt}`;
  if (lastReportedSubmission?.key === key && now - lastReportedSubmission.at < 1_500) return;
  lastReportedSubmission = { key, at: now };

  const match = result.matches[0];
  chrome.runtime.sendMessage({
    type: 'PROMPT_SUBMISSION',
    event: {
      eventType: 'prompt_submission',
      hostname: location.hostname,
      riskLevel: result.hasRisk ? result.highestRisk : 'LOW',
      actionTaken: outcome,
      ruleCode: match?.ruleCode || 'PROMPT_SUBMISSION',
      ruleName: match?.ruleName || 'Prompt submission',
      category: match?.category,
      explanation: result.explanation,
      redactedPreview: loggingEnabled ? result.redactedPrompt : undefined,
    },
  });
}

function inspect(event: Event, editor: HTMLElement | null): void {
  if (!authorized || !editor) return;
  const prompt = editorText(editor);
  if (!prompt.trim()) return;
  if (approvedWarning && approvedWarning.expiresAt >= Date.now() && approvedWarning.prompt === prompt) {
    approvedWarning = null;
    return;
  }
  approvedWarning = null;

  const result = engine.scan(prompt);
  if (!result.hasRisk || result.action === 'allow') {
    reportSubmission(result, prompt, 'allow');
    return;
  }

  if (result.action === 'warn') {
    if (confirmationOpen) {
      cancel(event);
      return;
    }
    confirmationOpen = true;
    const proceed = window.confirm(
      `Krypton detected sensitive content:\n${result.matches.slice(0, 5).map((match) => match.ruleName).join('\n')}\n\nSubmit anyway?`,
    );
    confirmationOpen = false;
    if (proceed) {
      approvedWarning = { prompt, expiresAt: Date.now() + 2_000 };
      reportSubmission(result, prompt, 'allow');
      return;
    }
  }

  cancel(event);
  reportSubmission(result, prompt, 'block');
  const ruleNames = Array.from(new Set(result.matches.map((match) => match.ruleName))).slice(0, 5);
  showBanner(ruleNames);
}

document.addEventListener('submit', (event) => {
  inspect(event, findEditor(event.target));
}, true);

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLElement>('button, [role="button"], input[type="submit"]');
  if (!button) return;
  const label = [
    button.getAttribute('aria-label') || '',
    button.getAttribute('title') || '',
    button.getAttribute('data-testid') || '',
    button.textContent || '',
  ].join(' ');
  if (
    button.getAttribute('type') === 'submit' ||
    button.matches('input[type="submit"]') ||
    /\b(send|submit)\b/i.test(label)
  ) {
    inspect(event, findEditor(button));
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.isComposing ||
    !(event.target instanceof HTMLElement) ||
    !event.target.matches(selector)
  ) {
    return;
  }
  inspect(event, findEditor(event.target));
}, true);

requestState();
setInterval(requestState, 30_000);
