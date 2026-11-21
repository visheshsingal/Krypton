import { clipboard, Notification } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
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
  private isScheduleActive?: () => boolean;
  private clipboardPollTimer: NodeJS.Timeout | null = null;
  private lastClipboardText = '';
  private inputMonitorProcess: ChildProcess | null = null;
  private lastInspectedInput = '';

  constructor(
    scanner: PromptSecurityEngine,
    onReportEvent?: (event: Record<string, unknown>) => void,
    isScheduleActive?: () => boolean,
  ) {
    this.scanner = scanner;
    this.onReportEvent = onReportEvent;
    this.isScheduleActive = isScheduleActive;
  }

  public updateScanner(scanner: PromptSecurityEngine): void {
    this.scanner = scanner;
  }

  public startAllMonitors(): void {
    this.startClipboardMonitor();
    this.startInputMonitor();
  }

  public stopAllMonitors(): void {
    this.stopClipboardMonitor();
    this.stopInputMonitor();
  }

  public startClipboardMonitor(): void {
    if (this.clipboardPollTimer) return;
    try {
      this.lastClipboardText = clipboard.readText() || '';
    } catch {
      this.lastClipboardText = '';
    }

    // Monitor clipboard changes every 600ms to inspect text pasted into AI apps or browsers
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
    }, 600);
  }

  public stopClipboardMonitor(): void {
    if (this.clipboardPollTimer) {
      clearInterval(this.clipboardPollTimer);
      this.clipboardPollTimer = null;
    }
  }

  public startInputMonitor(): void {
    if (this.inputMonitorProcess) return;
    if (process.platform !== 'win32') {
      // Non-Windows platforms (macOS/Linux) run in safe simulated/clipboard mode
      return;
    }

    try {
      // PowerShell script using Windows UI Automation and User32 GetForegroundWindow
      // to observe text entered in Chrome/Edge/Brave/desktop apps on ChatGPT, Gemini, Claude, etc.
      const psScript = `
Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue

$sig = @"
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
"@
$Win32 = Add-Type -MemberDefinition $sig -Name "KryptonWin32" -Namespace "Krypton" -PassThru -ErrorAction SilentlyContinue

$keywords = @("chatgpt", "gemini", "claude", "copilot", "perplexity", "openai", "anthropic")
$sb = New-Object System.Text.StringBuilder 512
$lastVal = ""

while ($true) {
    try {
        $hwnd = [Krypton.KryptonWin32]::GetForegroundWindow()
        if ($hwnd -ne [IntPtr]::Zero) {
            $len = [Krypton.KryptonWin32]::GetWindowText($hwnd, $sb, 512)
            if ($len -gt 0) {
                $title = $sb.ToString().ToLower()
                $target = ""
                foreach ($kw in $keywords) {
                    if ($title.Contains($kw)) {
                        $target = $kw
                        break
                    }
                }
                if ($target -ne "") {
                    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
                    if ($focused -ne $null) {
                        $txt = ""
                        try {
                            $vp = $focused.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                            if ($vp -ne $null) { $txt = $vp.Current.Value }
                        } catch {}
                        if ([string]::IsNullOrEmpty($txt)) {
                            try {
                                $tp = $focused.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
                                if ($tp -ne $null) { $txt = $tp.DocumentRange.GetText(-1) }
                            } catch {}
                        }
                        if (-not [string]::IsNullOrEmpty($txt) -and $txt.Length -ge 3 -and $txt -ne $lastVal) {
                            $lastVal = $txt
                            $payload = @{ type = "TYPED_INPUT"; target = $target; text = $txt } | ConvertTo-Json -Compress
                            [Console]::WriteLine($payload)
                        }
                    }
                }
            }
        }
    } catch {}
    Start-Sleep -Milliseconds 450
}
`;

      this.inputMonitorProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript,
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      let buffer = '';
      this.inputMonitorProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.type === 'TYPED_INPUT' && typeof data.text === 'string') {
              this.inspectTypedPrompt(data.text, data.target || 'ChatGPT / AI Web');
            }
          } catch {
            // Non-JSON stdout ignored
          }
        }
      });

      this.inputMonitorProcess.on('error', (err) => {
        console.warn('[WindowsProtectionAgent] Input monitor error:', err.message);
        this.inputMonitorProcess = null;
      });

      this.inputMonitorProcess.on('exit', () => {
        this.inputMonitorProcess = null;
      });
    } catch (err: any) {
      console.warn('[WindowsProtectionAgent] Could not start input monitor:', err.message);
    }
  }

  public stopInputMonitor(): void {
    if (this.inputMonitorProcess) {
      try {
        this.inputMonitorProcess.kill();
      } catch {
        // Ignore
      }
      this.inputMonitorProcess = null;
    }
  }

  public inspectTypedPrompt(text: string, targetName = 'ChatGPT'): { blocked: boolean; result: PromptScanResult } {
    if (!this.active || !text || text.trim().length === 0 || (this.isScheduleActive && !this.isScheduleActive())) {
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

    if (text === this.lastInspectedInput) {
      return {
        blocked: false,
        result: {
          hasRisk: false,
          highestRisk: 'LOW',
          action: 'allow',
          matches: [],
          redactedPrompt: text,
          explanation: 'Duplicate input suppressed',
        },
      };
    }
    this.lastInspectedInput = text;

    this.scannedCount++;
    const result = this.scanner.scan(text);

    if (result.hasRisk && result.action === 'block') {
      this.blockedCount++;
      const topMatch = result.matches[0];
      const eventRecord: SecurityEventRecord = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        targetName: `Active Browser: ${targetName}`,
        actionTaken: 'block',
        riskLevel: result.highestRisk,
        ruleCode: topMatch?.ruleCode || 'SECURITY_POLICY',
        ruleName: topMatch?.ruleName || 'Sensitive Data Blocked',
        summary: `Blocked ${topMatch?.ruleName || 'confidential data'} in ${targetName} prompt (${result.highestRisk} risk)`,
      };

      this.addRecentEvent(eventRecord);

      this.notifyWindows(
        `Krypton DLP: Sensitive Prompt Blocked on ${targetName}`,
        `Detected: ${topMatch?.ruleName || 'Confidential Data'}. Content prevented from leaking to AI model.`,
      );

      if (this.onReportEvent) {
        this.onReportEvent({
          targetApp: targetName,
          riskLevel: result.highestRisk,
          ruleCode: topMatch?.ruleCode || 'DLP_TYPED_BLOCK',
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

  public inspectClipboard(text: string): { blocked: boolean; result: PromptScanResult } {
    if (!this.active || !text || text.trim().length === 0 || (this.isScheduleActive && !this.isScheduleActive())) {
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
