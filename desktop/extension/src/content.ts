import { PromptSecurityEngine } from '../../src/engine/scanner';
import { scanFileLocally, ScannedFileResult } from '../../src/engine/file-scanner';
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
const replayedFileEvents = new WeakSet<Event>();
const fileInputScanVersions = new WeakMap<HTMLInputElement, number>();
const fileInputPendingScans = new WeakMap<HTMLInputElement, { files: File[]; version: number }>();
let nextFileScanVersion = 0;

const fileScanAssets = {
  pdfWorkerSrc: chrome.runtime.getURL('pdf.worker.min.mjs'),
  tesseractWorkerPath: chrome.runtime.getURL('tesseract-worker.min.js'),
  tesseractCorePath: chrome.runtime.getURL('tesseract-core/'),
  tesseractLangPath: chrome.runtime.getURL('tessdata'),
};

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

function showBanner(
  ruleNames: string[],
  title = 'Krypton blocked this submission',
  description = 'Sensitive content was detected locally. Remove it before submitting.',
): void {
  if (!banner || !banner.isConnected) {
    banner = document.createElement('div');
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:400px;padding:14px 18px;border:1px solid #38bdf8;border-radius:12px;background:#0b1220;color:#f8fafc;box-shadow:0 12px 40px #0009;font:14px/1.5 system-ui,sans-serif';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const descriptionElement = document.createElement('p');
    descriptionElement.dataset.kryptonDescription = 'true';
    descriptionElement.textContent = description;
    descriptionElement.style.marginBottom = '0';
    const list = document.createElement('ul');
    banner.append(heading, descriptionElement, list);
    (document.body || document.documentElement).append(banner);
  }
  const list = banner.querySelector('ul');
  if (!list) return;
  const heading = banner.querySelector('strong');
  const message = banner.querySelector<HTMLElement>('[data-krypton-description]');
  if (heading) heading.textContent = title;
  if (message) message.textContent = description;
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
  outcome: 'allow' | 'block' | 'warn',
  warningResponse?: 'proceeded' | 'dismissed',
  metadata: { inputType?: 'text' | 'file'; fileCount?: number; fileTypes?: string[] } = {},
): void {
  const loggingEnabled = currentPolicy?.redactedPromptLoggingEnabled === true;

  const now = Date.now();
  const key = metadata.inputType === 'file'
    ? `${outcome}:file:${metadata.fileCount}:${now}`
    : `${outcome}:${prompt}`;
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
      ...metadata,
      warningResponse,
      ruleCode: match?.ruleCode || 'PROMPT_SUBMISSION',
      ruleName: match?.ruleName || 'Prompt submission',
      category: match?.category,
      explanation: result.explanation,
      redactedPreview: loggingEnabled ? (result.redactedPrompt || '[Prompt text unavailable]') : undefined,
    },
  });
}

function mergeFileScans(results: ScannedFileResult[]): ReturnType<PromptSecurityEngine['scan']> {
  const matches = results.flatMap((result) => result.scan.matches);
  const riskPriority = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
  const highestRisk = results.reduce(
    (risk, result) => riskPriority[result.scan.highestRisk] > riskPriority[risk]
      ? result.scan.highestRisk
      : risk,
    'LOW' as keyof typeof riskPriority,
  );
  const action = results.some((result) => result.scan.action === 'block')
    ? 'block'
    : results.some((result) => result.scan.action === 'warn')
      ? 'warn'
      : 'allow';
  return {
    hasRisk: matches.length > 0,
    highestRisk,
    action,
    matches,
    redactedPrompt: '',
    explanation: Array.from(new Set(matches.map((match) => match.explanation))).join(' '),
  };
}

async function inspectFiles(files: File[]): Promise<ReturnType<PromptSecurityEngine['scan']>> {
  if (files.length === 0 || files.length > 10) {
    throw new Error('Select between 1 and 10 files for a safe scan.');
  }
  const results: ScannedFileResult[] = [];
  for (const file of files) {
    results.push(await scanFileLocally(file, engine, fileScanAssets));
  }
  return mergeFileScans(results);
}

function reportFileSubmission(
  result: ReturnType<PromptSecurityEngine['scan']>,
  files: File[],
  action: 'allow' | 'warn' | 'block',
  warningResponse?: 'proceeded' | 'dismissed',
): void {
  const supportedTypes = new Set([
    'txt', 'csv', 'tsv', 'md', 'json', 'xml', 'html', 'log', 'yaml', 'yml',
    'pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'bmp',
  ]);
  reportSubmission(result, 'file upload', action, warningResponse, {
    inputType: 'file',
    fileCount: files.length,
    fileTypes: Array.from(new Set(files.map((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      return supportedTypes.has(extension) ? extension : 'unknown';
    }))).slice(0, 10),
  });
}

async function handleSelectedFiles(
  files: File[],
  replay: () => void,
  clear: () => void,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  banner?.remove();
  banner = null;
  showBanner([], 'Scanning selected files', 'Files are being checked locally on this device. Their contents are not uploaded to Krypton.');
  try {
    const result = await inspectFiles(files);
    if (!isCurrent()) return;
    if (result.action === 'block') {
      clear();
      reportFileSubmission(result, files, 'block');
      showBanner(
        result.matches.map((match) => match.ruleName),
        'Krypton blocked this file upload',
        'Sensitive content was detected locally. Remove or replace it before uploading.',
      );
      return;
    }

    if (result.action === 'warn') {
      if (currentPolicy?.allowEmployeeBypassWarning === false) {
        clear();
        reportFileSubmission(result, files, 'block');
        showBanner(
          result.matches.map((match) => match.ruleName),
          'Krypton blocked this file upload',
          'Company policy does not allow continuing after this warning.',
        );
        return;
      }
      const proceed = window.confirm(
        `Krypton found information that may be sensitive in the selected file(s):\n${result.matches.slice(0, 5).map((match) => match.ruleName).join('\n')}\n\nContinue with this upload?`,
      );
      reportFileSubmission(result, files, proceed ? 'warn' : 'block', proceed ? 'proceeded' : 'dismissed');
      if (!proceed) {
        clear();
        showBanner(
          result.matches.map((match) => match.ruleName),
          'File upload stopped',
          'Review the detected information before trying again.',
        );
        return;
      }
    } else {
      reportFileSubmission(result, files, 'allow');
    }
    replay();
    banner?.remove();
    banner = null;
  } catch (error) {
    if (!isCurrent()) return;
    clear();
    showBanner(
      [],
      'Krypton could not scan this file',
      error instanceof Error ? `${error.message} The upload was stopped.` : 'The upload was stopped because scanning failed.',
    );
  }
}

function sameFiles(left: File[], right: File[]): boolean {
  return left.length === right.length && left.every((file, index) => file === right[index]);
}

function scanFileInput(input: HTMLInputElement, files: File[]): void {
  const version = ++nextFileScanVersion;
  fileInputScanVersions.set(input, version);
  fileInputPendingScans.set(input, { files, version });
  const stillSelected = () => fileInputScanVersions.get(input) === version;
  void handleSelectedFiles(
    files,
    () => {
      if (!stillSelected()) return;
      fileInputPendingScans.delete(input);
      for (const type of ['input', 'change']) {
        const replayed = new Event(type, { bubbles: true });
        replayedFileEvents.add(replayed);
        input.dispatchEvent(replayed);
      }
    },
    () => {
      if (stillSelected()) {
        fileInputPendingScans.delete(input);
        input.value = '';
      }
    },
    stillSelected,
  );
}

function interceptFileInputEvent(event: Event): void {
  if (replayedFileEvents.has(event)) return;
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'file') return;
  const input = event.target;
  const files = Array.from(input.files || []);
  if (!authorized || files.length === 0 || !findEditor(input)) return;

  const pending = fileInputPendingScans.get(input);
  if (pending && sameFiles(pending.files, files)) {
    cancel(event);
    return;
  }
  cancel(event);
  scanFileInput(input, files);
}

window.addEventListener('input', interceptFileInputEvent, true);
window.addEventListener('change', interceptFileInputEvent, true);

window.addEventListener('drop', (event) => {
  if (replayedFileEvents.has(event) || !authorized || !event.dataTransfer?.files.length) return;
  const files = Array.from(event.dataTransfer.files);
  if (!findEditor(event.target)) return;
  const dropTarget = event.target instanceof Element ? event.target : document;
  cancel(event);
  void handleSelectedFiles(
    files,
    () => {
      const dataTransfer = new DataTransfer();
      files.forEach((file) => dataTransfer.items.add(file));
      const replayed = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      replayedFileEvents.add(replayed);
      dropTarget.dispatchEvent(replayed);
    },
    () => undefined,
  );
}, true);

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
      reportSubmission(result, prompt, 'warn', 'proceeded');
      return;
    } else {
      cancel(event);
      reportSubmission(result, prompt, 'block', 'dismissed');
      const ruleNames = Array.from(new Set(result.matches.map((match) => match.ruleName))).slice(0, 5);
      showBanner(ruleNames);
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
