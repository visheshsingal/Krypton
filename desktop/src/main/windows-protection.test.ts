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

  it('toggles target status and master protection', () => {
    agent.setTargetEnabled('gemini', false);
    const summary = agent.getSummary();
    const gemini = summary.targets.find((t) => t.id === 'gemini');
    expect(gemini?.enabled).toBe(false);

    agent.toggleActive(false);
    expect(agent.isActive()).toBe(false);
  });
});
