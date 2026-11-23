import { WindowsProtectionAgent, DEFAULT_PROTECTED_TARGETS } from './windows-protection';
import { PromptSecurityEngine } from '../engine/scanner';

// Mock electron
jest.mock('electron', () => ({
  clipboard: {
    readText: jest.fn(() => ''),
    writeText: jest.fn(),
  },
  Notification: class {
    static isSupported() {
      return true;
    }
    show = jest.fn();
  },
}));

describe('WindowsProtectionAgent', () => {
  let agent: WindowsProtectionAgent;
  let engine: PromptSecurityEngine;

  beforeEach(() => {
    engine = new PromptSecurityEngine();
    agent = new WindowsProtectionAgent(engine);
  });

  afterEach(() => {
    agent.stopClipboardMonitor();
  });

  it('initializes with 5 default protected targets and extension-free status', () => {
    const summary = agent.getSummary();
    expect(summary.active).toBe(true);
    expect(summary.noExtensionRequired).toBe(true);
    expect(summary.inputMonitorReady).toBe(false);
    expect(summary.targets.length).toBe(5);
    expect(summary.targets.map((t) => t.id)).toEqual([
      'chatgpt',
      'gemini',
      'claude',
      'copilot',
      'perplexity',
    ]);
  });

  it('allows safe prompts', () => {
    const { blocked, result } = agent.inspectClipboard('Hello how to write a quicksort in python?');
    expect(blocked).toBe(false);
    expect(result.action).toBe('allow');
    const summary = agent.getSummary();
    expect(summary.stats.allowedCount).toBe(1);
    expect(summary.stats.blockedCount).toBe(0);
  });

  it('blocks sensitive prompt containing API keys and logs event', () => {
    const sensitive = 'sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef';
    const { blocked, result } = agent.inspectClipboard(sensitive);
    expect(blocked).toBe(true);
    expect(result.action).toBe('block');

    const summary = agent.getSummary();
    expect(summary.stats.blockedCount).toBe(1);
    expect(summary.recentEvents.length).toBe(1);
    expect(summary.recentEvents[0].actionTaken).toBe('block');
  });

  it('scans and blocks sensitive typed prompts from active Chrome/Edge on ChatGPT', () => {
    const safeTyped = 'How do I center a div in Tailwind CSS?';
    const res1 = agent.inspectTypedPrompt(safeTyped, 'ChatGPT');
    expect(res1.blocked).toBe(false);
    expect(res1.result.action).toBe('allow');

    const sensitiveTyped = 'my secret key sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef';
    const res2 = agent.inspectTypedPrompt(sensitiveTyped, 'ChatGPT');
    expect(res2.blocked).toBe(true);
    expect(res2.result.action).toBe('block');

    const summary = agent.getSummary();
    expect(summary.stats.blockedCount).toBe(1);
    expect(summary.stats.allowedCount).toBe(1);
    expect(summary.recentEvents[0].targetName).toContain('ChatGPT');
    expect(summary.recentEvents[0].actionTaken).toBe('block');
  });

  it('does not scan a target platform after its protection is disabled', () => {
    agent.setTargetEnabled('chatgpt', false);

    const result = agent.inspectTypedPrompt(
      'sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef',
      'ChatGPT',
    );

    expect(result.blocked).toBe(false);
    expect(result.result.explanation).toBe('Target platform is disabled.');
    expect(agent.getSummary().stats.scannedCount).toBe(0);
  });

  it('keeps warning-level prompts pending for an allow-once or block decision', () => {
    const warningAgent = new WindowsProtectionAgent(new PromptSecurityEngine());

    const prompt = warningAgent.inspectTypedPrompt('Contact test@example.com', 'ChatGPT');
    const paste = warningAgent.inspectClipboard('Contact test@example.com', 'ChatGPT');

    expect(prompt.result.action).toBe('warn');
    expect(paste.result.action).toBe('warn');
    expect(warningAgent.getSummary().stats.allowedCount).toBe(0);
    warningAgent.stopAllMonitors();
  });

  it('handles startAllMonitors and stopAllMonitors lifecycle cleanly', () => {
    agent.startAllMonitors();
    agent.stopAllMonitors();
    expect(agent.isActive()).toBe(true);
  });

  it('toggles target status and master protection', () => {
    agent.setTargetEnabled('gemini', false);
    const summary = agent.getSummary();
    const gemini = summary.targets.find((t) => t.id === 'gemini');
    expect(gemini?.enabled).toBe(false);

    agent.toggleActive(false);
    expect(agent.isActive()).toBe(false);
  });
});
