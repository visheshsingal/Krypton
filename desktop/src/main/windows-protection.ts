import { clipboard, Notification } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    name: 'ChatGPT',
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
    name: 'Claude AI',
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

    // Monitor clipboard changes every 500ms to inspect text pasted into AI apps or browsers
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
    }, 500);
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
      // Robust native C# low-level keyboard hook (SetWindowsHookEx WH_KEYBOARD_LL)
      // Captures typed characters when active window is an AI site (ChatGPT, Gemini, Claude, Copilot, Perplexity)
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

$source = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

public class KryptonInputGuard {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int VK_BACK = 0x08;
    private const int VK_RETURN = 0x0D;
    private const int VK_ESCAPE = 0x1B;

    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static StringBuilder _buffer = new StringBuilder();
    private static string[] _targetKeywords = new string[] { "chatgpt", "gemini", "claude", "copilot", "perplexity", "openai", "anthropic" };
    private static StringBuilder _titleSb = new StringBuilder(512);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern int ToUnicode(uint wVirtKey, uint wScanCode, byte[] lpKeyState, [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pwszBuff, int cchBuff, uint wFlags);

    [DllImport("user32.dll")]
    private static extern bool GetKeyboardState(byte[] lpKeyState);

    public static void Start() {
        _hookID = SetHook(_proc);
        Application.Run();
        UnhookWindowsHookEx(_hookID);
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static bool CheckSensitiveData(string text, out string ruleName) {
        ruleName = null;
        if (string.IsNullOrEmpty(text)) return false;

        if (Regex.IsMatch(text, @"gh[pousr]_[A-Za-z0-9_]{30,}") || Regex.IsMatch(text, @"github_pat_[A-Za-z0-9_]{22,}")) {
            ruleName = "GitHub Personal Access Token";
            return true;
        }
        if (Regex.IsMatch(text, @"sk-[A-Za-z0-9_-]{20,}")) {
            ruleName = "OpenAI API Secret Key";
            return true;
        }
        if (Regex.IsMatch(text, @"AKIA[0-9A-Z]{16}")) {
            ruleName = "AWS Access Key";
            return true;
        }
        if (Regex.IsMatch(text, @"AIza[0-9A-Za-z-_]{35}")) {
            ruleName = "Google Cloud API Key";
            return true;
        }
        if (Regex.IsMatch(text, @"-----BEGIN (RSA|EC|DSA|OPENSSH|PRIVATE) KEY-----")) {
            ruleName = "Private Encryption Key";
            return true;
        }
        if (Regex.IsMatch(text, @"(password|secret|passwd)\s*[:=]\s*\S+", RegexOptions.IgnoreCase)) {
            ruleName = "Plaintext Password/Secret";
            return true;
        }
        return false;
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
            int vkCode = Marshal.ReadInt32(lParam);

            IntPtr hwnd = GetForegroundWindow();
            if (hwnd != IntPtr.Zero) {
                int len = GetWindowText(hwnd, _titleSb, 512);
                if (len > 0) {
                    string title = _titleSb.ToString().ToLower();
                    string matchedTarget = null;
                    foreach (string kw in _targetKeywords) {
                        if (title.Contains(kw)) {
                            matchedTarget = kw;
                            break;
                        }
                    }

                    if (matchedTarget != null) {
                        if (vkCode == VK_BACK) {
                            if (_buffer.Length > 0) {
                                _buffer.Remove(_buffer.Length - 1, 1);
                            }
                        } else if (vkCode == VK_ESCAPE) {
                            _buffer.Clear();
                        } else if (vkCode == VK_RETURN) {
                            string text = _buffer.ToString();
                            if (text.Length > 0) {
                                string detectedRule;
                                if (CheckSensitiveData(text, out detectedRule)) {
                                    EmitPrompt(matchedTarget, text);
                                    _buffer.Clear();

                                    DialogResult choice = MessageBox.Show(
                                        "Krypton DLP Security Alert:\n\nSensitive data detected (" + detectedRule + ").\n\nPrompt submission to " + matchedTarget.ToUpper() + " was stopped.\n\nDo you want to ALLOW this prompt anyway?",
                                        "Krypton AI Security - Zero Extension DLP",
                                        MessageBoxButtons.YesNo,
                                        MessageBoxIcon.Warning,
                                        MessageBoxDefaultButton.Button2
                                    );

                                    if (choice == DialogResult.No) {
                                        SendKeys.SendWait("^a{BACKSPACE}");
                                        return (IntPtr)1;
                                    } else {
                                        SendKeys.SendWait("{ENTER}");
                                        return (IntPtr)1;
                                    }
                                } else {
                                    EmitPrompt(matchedTarget, text);
                                    _buffer.Clear();
                                }
                            }
                        } else {
                            byte[] keyState = new byte[256];
                            GetKeyboardState(keyState);
                            StringBuilder charBuffer = new StringBuilder(10);
                            int result = ToUnicode((uint)vkCode, 0, keyState, charBuffer, charBuffer.Capacity, 0);
                            if (result > 0) {
                                string str = charBuffer.ToString();
                                _buffer.Append(str);
                                string cur = _buffer.ToString();
                                if (cur.Length >= 10 && (cur.Length % 20 == 0 || cur.Contains("sk-") || cur.Contains("ghp_") || cur.Contains("AKIA"))) {
                                    EmitPrompt(matchedTarget, cur);
                                }
                            }
                        }
                    } else {
                        if (_buffer.Length > 0) {
                            _buffer.Clear();
                        }
                    }
                }
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    private static void EmitPrompt(string target, string text) {
        string escaped = text.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"").Replace("\\r", "").Replace("\\n", "\\\\n");
        Console.WriteLine("{\\"type\\":\\"TYPED_INPUT\\",\\"target\\":\\"" + target + "\\",\\"text\\":\\"" + escaped + "\\"}");
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms -ErrorAction Stop
[KryptonInputGuard]::Start()
`;

      const scriptPath = path.join(os.tmpdir(), 'krypton-input-guard.ps1');
      fsSync.writeFileSync(scriptPath, psScript, 'utf8');

      this.inputMonitorProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
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
              this.inspectTypedPrompt(data.text, data.target || 'ChatGPT');
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
        targetName: `Typed Prompt: ${targetName}`,
        actionTaken: 'block',
        riskLevel: result.highestRisk,
        ruleCode: topMatch?.ruleCode || 'SECURITY_POLICY',
        ruleName: topMatch?.ruleName || 'Sensitive Data Blocked',
        summary: `Blocked ${topMatch?.ruleName || 'confidential data'} in ${targetName} prompt (${result.highestRisk} risk)`,
      };

      this.addRecentEvent(eventRecord);

      this.notifyWindows(
        `Krypton DLP: Sensitive Prompt Blocked on ${targetName}`,
        `Detected: ${topMatch?.ruleName || 'Confidential Data'}. Content prevented from reaching AI model.`,
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
