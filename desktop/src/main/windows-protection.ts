import { clipboard, Notification } from 'electron';
import { PromptSecurityEngine } from '../engine/scanner';
import { PromptScanResult, RiskLevel } from '@krypton/shared';

export interface ProtectedTargetConfig {
  id: string;
  name: string;
  type: 'web' | 'desktop' | 'both';
  domain: string;
  processNames: string[];
  enabled: boolean;
  category: 'ChatGPT' | 'Claude' | 'Gemini' | 'Copilot' | 'Perplexity';
}

export interface SecurityEventRecord {
  id: string;
  timestamp: string;
  targetName: string;
  actionTaken: 'block' | 'warn' | 'allow';
  riskLevel: RiskLevel;
  ruleCode: string;
  ruleName: string;
  summary: string;
}

export interface WindowsProtectionSummary {
  active: boolean;
  platform: string;
  noExtensionRequired: boolean;
  targets: ProtectedTargetConfig[];
  stats: {
    scannedCount: number;
    blockedCount: number;
    allowedCount: number;
  };
  recentEvents: SecurityEventRecord[];
}

export const DEFAULT_PROTECTED_TARGETS: ProtectedTargetConfig[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT (Web & Windows App)',
    type: 'both',
    domain: 'chatgpt.com',
    processNames: ['ChatGPT.exe', 'chatgpt.exe'],
    enabled: true,
    category: 'ChatGPT',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'web',
    domain: 'gemini.google.com',
    processNames: [],
    enabled: true,
    category: 'Gemini',
  },
  {
    id: 'claude',
    name: 'Claude AI (Web & Windows App)',
    type: 'both',
    domain: 'claude.ai',
    processNames: ['Claude.exe', 'claude.exe'],
    enabled: true,
    category: 'Claude',
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    type: 'web',
    domain: 'copilot.microsoft.com',
    processNames: [],
    enabled: true,
    category: 'Copilot',
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    type: 'both',
    domain: 'perplexity.ai',
    processNames: ['Perplexity.exe', 'perplexity.exe'],
    enabled: true,
    category: 'Perplexity',
  },
];

export class WindowsProtectionAgent {
  private active = true;
  private scanner: PromptSecurityEngine;
  private targets: ProtectedTargetConfig[] = [...DEFAULT_PROTECTED_TARGETS];
  private scannedCount = 0;
  private blockedCount = 0;
  private allowedCount = 0;
  private recentEvents: SecurityEventRecord[] = [];
  private onReportEvent?: (event: Record<string, unknown>) => void;
  private clipboardPollTimer: NodeJS.Timeout | null = null;
  private lastClipboardText = '';

  constructor(
    scanner: PromptSecurityEngine,
    onReportEvent?: (event: Record<string, unknown>) => void,
  ) {
    this.scanner = scanner;
    this.onReportEvent = onReportEvent;
  }

  public updateScanner(scanner: PromptSecurityEngine): void {
    this.scanner = scanner;
  }

  public startClipboardMonitor(): void {
    if (this.clipboardPollTimer) return;
    try {
      this.lastClipboardText = clipboard.readText() || '';
    } catch {
      this.lastClipboardText = '';
    }

    // Monitor clipboard changes every 800ms to inspect text pasted into AI apps or browsers
    this.clipboardPollTimer = setInterval(() => {
      if (!this.active) return;
      try {
        const text = clipboard.readText();
        if (text && text !== this.lastClipboardText) {
          this.lastClipboardText = text;
          this.inspectClipboard(text);
        }
      } catch {
        // Ignore clipboard lock errors in Windows
      }
    }, 800);
  }

  public stopClipboardMonitor(): void {
    if (this.clipboardPollTimer) {
      clearInterval(this.clipboardPollTimer);
      this.clipboardPollTimer = null;
    }
  }

  public inspectClipboard(text: string): { blocked: boolean; result: PromptScanResult } {
    if (!this.active || !text || text.trim().length === 0) {
      return {
        blocked: false,
        result: {
          hasRisk: false,
          highestRisk: 'LOW',
          action: 'allow',
          matches: [],
          redactedPrompt: text,
          explanation: '',
        },
      };
    }

    this.scannedCount++;
    const result = this.scanner.scan(text);

    if (result.hasRisk && result.action === 'block') {
      this.blockedCount++;
      const topMatch = result.matches[0];
      const eventRecord: SecurityEventRecord = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        targetName: 'Windows AI Clipboard / Desktop App',
        actionTaken: 'block',
        riskLevel: result.highestRisk,
        ruleCode: topMatch?.ruleCode || 'SECURITY_POLICY',
        ruleName: topMatch?.ruleName || 'Sensitive Data Blocked',
        summary: `Blocked ${topMatch?.ruleName || 'confidential data'} (${result.highestRisk} risk)`,
      };

      this.addRecentEvent(eventRecord);

      // Redact or clear sensitive clipboard text to prevent leak to AI tools
      try {
        clipboard.writeText(`[KRYPTON DLP BLOCKED: ${topMatch?.ruleName || 'Sensitive Content'} was detected and protected.]`);
        this.lastClipboardText = clipboard.readText();
      } catch {
        // Ignore
      }

      // Show native Windows Toast notification
      this.notifyWindows(
        'Krypton Endpoint: Sensitive Prompt Blocked',
        `Detected: ${topMatch?.ruleName || 'Confidential Data'}. Content was prevented from reaching AI apps.`,
      );

      // Report to remote backend if callback provided
      if (this.onReportEvent) {
        this.onReportEvent({
          targetApp: 'Windows AI App / Browser',
          riskLevel: result.highestRisk,
          ruleCode: topMatch?.ruleCode || 'DLP_BLOCK',
          ruleName: topMatch?.ruleName || 'Sensitive Data Blocked',
          actionTaken: 'block',
          redactedPreview: result.redactedPrompt?.slice(0, 500),
          timestamp: new Date().toISOString(),
        });
      }

      return { blocked: true, result };
    }

    this.allowedCount++;
    return { blocked: false, result };
  }

  public toggleActive(enabled: boolean): boolean {
    this.active = enabled;
    return this.active;
  }

  public isActive(): boolean {
    return this.active;
  }

  public setTargetEnabled(targetId: string, enabled: boolean): void {
    const target = this.targets.find((t) => t.id === targetId);
    if (target) {
      target.enabled = enabled;
    }
  }

  public getSummary(): WindowsProtectionSummary {
    return {
      active: this.active,
      platform: process.platform,
      noExtensionRequired: true,
      targets: [...this.targets],
      stats: {
        scannedCount: this.scannedCount,
        blockedCount: this.blockedCount,
        allowedCount: this.allowedCount,
      },
      recentEvents: [...this.recentEvents],
    };
  }

  private addRecentEvent(event: SecurityEventRecord): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 25) {
      this.recentEvents.pop();
    }
  }

  private notifyWindows(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title,
          body,
          silent: false,
        });
        notification.show();
      }
    } catch {
      // Ignored if notifications not available
    }
  }
}
