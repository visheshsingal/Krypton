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
  inputMonitorReady: boolean;
  targets: ProtectedTargetConfig[];
  stats: {
    scannedCount: number;
    blockedCount: number;
    allowedCount: number;
  };
  recentEvents: SecurityEventRecord[];
}

interface NativeInputMessage {
  type?: string;
  id?: number;
  target?: string;
  text?: string;
  action?: string;
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
  private targets: ProtectedTargetConfig[] = DEFAULT_PROTECTED_TARGETS.map((target) => ({
    ...target,
    processNames: [...target.processNames],
  }));
  private scannedCount = 0;
  private blockedCount = 0;
  private allowedCount = 0;
  private recentEvents: SecurityEventRecord[] = [];
  private onReportEvent?: (event: Record<string, unknown>) => void;
  private onWarning?: (details: { targetName: string; ruleName: string; riskLevel: RiskLevel }) => Promise<boolean>;
  private isScheduleActive?: () => boolean;
  private clipboardPollTimer: NodeJS.Timeout | null = null;
  private lastClipboardText = '';
  private inputMonitorProcess: ChildProcess | null = null;
  private inputMonitorReady = false;
  private pendingWarningApproval: { targetName: string; text: string } | null = null;

  constructor(
    scanner: PromptSecurityEngine,
    onReportEvent?: (event: Record<string, unknown>) => void,
    isScheduleActive?: () => boolean,
    onWarning?: (details: { targetName: string; ruleName: string; riskLevel: RiskLevel }) => Promise<boolean>,
  ) {
    this.scanner = scanner;
    this.onReportEvent = onReportEvent;
    this.isScheduleActive = isScheduleActive;
    this.onWarning = onWarning;
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

    let scriptPath: string | null = null;
    try {
      const targetKeywords = this.targets
        .filter((target) => target.enabled)
        .flatMap((target) => [target.id, target.name, target.domain])
        .map((value) => value.toLowerCase())
        .filter((value, index, values) => values.indexOf(value) === index);
      const targetProcesses = this.targets
        .filter((target) => target.enabled)
        .flatMap((target) => target.processNames)
        .map((value) => value.replace(/\.exe$/i, '').toLowerCase())
        .filter((value, index, values) => values.indexOf(value) === index);
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

$source = @"
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Windows.Automation;
using System.Threading;

public class KryptonInputGuard {
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int VK_BACK = 0x08;
    private const int VK_RETURN = 0x0D;
    private const int VK_ESCAPE = 0x1B;
    private const int VK_CONTROL = 0x11;
    private const int VK_SHIFT = 0x10;
    private const int VK_V = 0x56;
    private const int VK_A = 0x41;
    private const int VK_X = 0x58;
    private const int VK_INSERT = 0x2D;
    private const int MAX_INPUT_LENGTH = 250000;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint LLKHF_INJECTED = 0x00000010;
    private const uint LLMHF_INJECTED = 0x00000001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;

    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    public delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static LowLevelMouseProc _mouseProc = MouseHookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static IntPtr _mouseHookID = IntPtr.Zero;
    private struct Point {
        public int X;
        public int Y;
    }
    private static StringBuilder _buffer = new StringBuilder();
    private static bool _bufferOverflow = false;
    private static string[] _targetKeywords = new string[] { ${targetKeywords.map((value) => `"${value.replace(/"/g, '')}"`).join(', ')} };
    private static string[] _targetProcesses = new string[] { ${targetProcesses.map((value) => `"${value.replace(/"/g, '')}"`).join(', ')} };
    private static StringBuilder _titleSb = new StringBuilder(512);
    private static long _requestId = 0;
    private static ConcurrentDictionary<long, IntPtr> _pendingRequests = new ConcurrentDictionary<long, IntPtr>();
    private static ConcurrentDictionary<long, string> _pendingPasteText = new ConcurrentDictionary<long, string>();
    private static ConcurrentDictionary<long, Point> _pendingClicks = new ConcurrentDictionary<long, Point>();
    private static IntPtr _foregroundTarget = IntPtr.Zero;
    private static string _bufferTarget = "";
    private static JavaScriptSerializer _json = new JavaScriptSerializer();
    private static int _decisionPending = 0;

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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern int ToUnicode(uint wVirtKey, uint wScanCode, byte[] lpKeyState, [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pwszBuff, int cchBuff, uint wFlags);

    [DllImport("user32.dll")]
    private static extern bool GetKeyboardState(byte[] lpKeyState);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out Point point);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    public static void Start() {
        _hookID = SetHook(_proc);
        _mouseHookID = SetMouseHook(_mouseProc);
        if (_hookID == IntPtr.Zero || _mouseHookID == IntPtr.Zero) {
            if (_hookID != IntPtr.Zero) UnhookWindowsHookEx(_hookID);
            if (_mouseHookID != IntPtr.Zero) UnhookWindowsHookEx(_mouseHookID);
            Console.Error.WriteLine("Could not install the Windows keyboard and mouse hooks.");
            return;
        }
        new Thread(ReadCommands) { IsBackground = true }.Start();
        Console.WriteLine("{\\"type\\":\\"READY\\"}");
        Application.Run();
        UnhookWindowsHookEx(_hookID);
        UnhookWindowsHookEx(_mouseHookID);
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static IntPtr SetMouseHook(LowLevelMouseProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_MOUSE_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static string GetTargetName(IntPtr hwnd) {
        if (hwnd == IntPtr.Zero) return "";
        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        string procName = "";
        try {
            using (Process p = Process.GetProcessById((int)pid)) {
                procName = p.ProcessName.ToLower();
            }
        } catch {}

        int len = GetWindowText(hwnd, _titleSb, 512);
        string title = len > 0 ? _titleSb.ToString().ToLower() : "";
        foreach (string targetProcess in _targetProcesses) {
            if (procName == targetProcess) return targetProcess;
        }
        foreach (string kw in _targetKeywords) {
            if (title.Contains(kw)) return kw;
        }
        return "";
    }

    private static bool IsButtonAt(int x, int y, out bool accessible) {
        accessible = false;
        try {
            AutomationElement element = AutomationElement.FromPoint(new System.Windows.Point(x, y));
            accessible = element != null;
            for (int i = 0; i < 4 && element != null; i++) {
                string name = (element.Current.Name ?? "").ToLower();
                string automationId = (element.Current.AutomationId ?? "").ToLower();
                string helpText = (element.Current.HelpText ?? "").ToLower();
                if (
                    (element.Current.ControlType == ControlType.Button &&
                        (name.Contains("send") || name.Contains("submit") || name.Contains("ask"))) ||
                    automationId.Contains("send") || automationId.Contains("submit") ||
                    helpText.Contains("send") || helpText.Contains("submit")
                ) return true;
                element = TreeWalker.ControlViewWalker.GetParent(element);
            }
        } catch {
            accessible = false;
        }
        return false;
    }

    private static void ReplayClick(int x, int y, IntPtr hwnd) {
        Point current;
        if (GetForegroundWindow() != hwnd || !GetCursorPos(out current) || current.X != x || current.Y != y) return;
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    private static string GetFocusedControlText() {
        try {
            AutomationElement focused = AutomationElement.FocusedElement;
            if (focused == null) return "";
            object pattern;
            if (focused.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
                string value = ((ValuePattern)pattern).Current.Value ?? "";
                return value;
            }
            if (focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
                return ((TextPattern)pattern).DocumentRange.GetText(MAX_INPUT_LENGTH + 1) ?? "";
            }
        } catch {
            // Some browser controls do not expose accessibility text.
        }
        return "";
    }

    private static void QueueInputRequest(string type, string target, IntPtr hwnd, string action, int clickX = 0, int clickY = 0) {
        try {
            Thread worker = new Thread(delegate() {
                try {
                    if (GetForegroundWindow() != hwnd) {
                        Interlocked.Exchange(ref _decisionPending, 0);
                        return;
                    }
                    if (action == "click") {
                        bool accessible;
                        if (!IsButtonAt(clickX, clickY, out accessible)) {
                            if (accessible) {
                                ReplayClick(clickX, clickY, hwnd);
                            } else {
                                RequestDecision("ACCESSIBILITY_UNAVAILABLE", target, "", hwnd, action, clickX, clickY);
                            }
                            if (accessible) Interlocked.Exchange(ref _decisionPending, 0);
                            return;
                        }
                    }
                    string text = type == "PASTE_REQUEST"
                        ? (Clipboard.GetText(TextDataFormat.UnicodeText) ?? "")
                        : GetFocusedControlText();
                    if (type == "PROMPT_REQUEST" && text.Length == 0) text = _buffer.ToString();
                    if (
                        text.Length > MAX_INPUT_LENGTH ||
                        (type == "PROMPT_REQUEST" && text.Length == 0 && _bufferOverflow)
                    ) {
                    RequestDecision("OVERSIZE_REQUEST", target, "", hwnd, action, clickX, clickY);
                        return;
                    }
                    RequestDecision(type, target, text, hwnd, action, clickX, clickY);
                } catch (Exception ex) {
                    Interlocked.Exchange(ref _decisionPending, 0);
                    Console.Error.WriteLine("Could not read the focused input: " + ex.Message);
                }
            });
            worker.IsBackground = true;
            worker.SetApartmentState(ApartmentState.STA);
            worker.Start();
        } catch (Exception ex) {
            Interlocked.Exchange(ref _decisionPending, 0);
            Console.Error.WriteLine("Could not queue the focused input for scanning: " + ex.Message);
        }
    }

    private static bool IsControlDown() {
        return (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
    }

    private static bool IsShiftDown() {
        return (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
    }

    private static long RequestDecision(string type, string target, string text, IntPtr hwnd, string action, int clickX = 0, int clickY = 0) {
        long id = Interlocked.Increment(ref _requestId);
        _pendingRequests[id] = hwnd;
        if (type == "PASTE_REQUEST") _pendingPasteText[id] = text ?? "";
        if (action == "click") _pendingClicks[id] = new Point { X = clickX, Y = clickY };
        lock (_json) {
            Console.WriteLine(_json.Serialize(new { type = type, id = id, target = target ?? "AI platform", text = text ?? "", action = action }));
        }
        return id;
    }

    private static void ReadCommands() {
        string line;
        while ((line = Console.ReadLine()) != null) {
            try {
                Dictionary<string, object> command;
                lock (_json) {
                    command = _json.DeserializeObject(line) as Dictionary<string, object>;
                }
                if (command == null || !command.ContainsKey("id") || !command.ContainsKey("allow") || !command.ContainsKey("action")) continue;
                long id = Convert.ToInt64(command["id"]);
                IntPtr hwnd;
                if (!_pendingRequests.TryRemove(id, out hwnd)) continue;
                string pastedText;
                _pendingPasteText.TryRemove(id, out pastedText);
                Point clickPoint;
                _pendingClicks.TryRemove(id, out clickPoint);
                if (!Convert.ToBoolean(command["allow"])) {
                    Interlocked.Exchange(ref _decisionPending, 0);
                    continue;
                }
                if (GetForegroundWindow() != hwnd) {
                    Interlocked.Exchange(ref _decisionPending, 0);
                    continue;
                }

                string action = Convert.ToString(command["action"]);
                if (action == "paste") {
                    if (!string.IsNullOrEmpty(pastedText)) {
                        if (_buffer.Length + pastedText.Length <= MAX_INPUT_LENGTH) _buffer.Append(pastedText);
                        else _bufferOverflow = true;
                    }
                    keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
                    keybd_event(VK_V, 0, 0, UIntPtr.Zero);
                    keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                } else if (action == "click") {
                    ReplayClick(clickPoint.X, clickPoint.Y, hwnd);
                } else if (action == "submit") {
                    _buffer.Clear();
                    _bufferOverflow = false;
                    keybd_event(VK_RETURN, 0, 0, UIntPtr.Zero);
                    keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                } else {
                    Interlocked.Exchange(ref _decisionPending, 0);
                    continue;
                }
                Interlocked.Exchange(ref _decisionPending, 0);
            } catch (Exception ex) {
                Interlocked.Exchange(ref _decisionPending, 0);
                Console.Error.WriteLine("Input decision failed: " + ex.Message);
            }
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
            uint flags = unchecked((uint)Marshal.ReadInt32(lParam, 8));
            if ((flags & LLKHF_INJECTED) != 0) {
                return CallNextHookEx(_hookID, nCode, wParam, lParam);
            }
            if (Volatile.Read(ref _decisionPending) != 0) return (IntPtr)1;
            int vkCode = Marshal.ReadInt32(lParam);

            IntPtr hwnd = GetForegroundWindow();
            if (hwnd != IntPtr.Zero) {
                string matchedTarget = GetTargetName(hwnd);
                bool isTarget = matchedTarget.Length > 0;

                if (isTarget) {
                    if (_foregroundTarget != hwnd || _bufferTarget != matchedTarget) {
                        _buffer.Clear();
                        _bufferOverflow = false;
                    }
                    _foregroundTarget = hwnd;
                    _bufferTarget = matchedTarget;
                    if ((vkCode == VK_V && IsControlDown()) || (vkCode == VK_INSERT && IsShiftDown())) {
                        if (Interlocked.CompareExchange(ref _decisionPending, 1, 0) == 0) {
                            QueueInputRequest("PASTE_REQUEST", matchedTarget, hwnd, "paste");
                        }
                        return (IntPtr)1;
                    }

                    if (vkCode == VK_RETURN && !IsShiftDown()) {
                        if (Interlocked.CompareExchange(ref _decisionPending, 1, 0) == 0) {
                            QueueInputRequest("PROMPT_REQUEST", matchedTarget, hwnd, "submit");
                        }
                        return (IntPtr)1;
                    }

                    if (vkCode == VK_BACK) {
                        if (IsControlDown()) {
                            _buffer.Clear();
                            _bufferOverflow = false;
                        } else if (_buffer.Length > 0) {
                            _buffer.Remove(_buffer.Length - 1, 1);
                            if (_buffer.Length == 0) _bufferOverflow = false;
                        }
                    } else if (vkCode == VK_ESCAPE) {
                        _buffer.Clear();
                        _bufferOverflow = false;
                    } else if (IsControlDown() && (vkCode == VK_A || vkCode == VK_X)) {
                        _buffer.Clear();
                        _bufferOverflow = false;
                    } else if (vkCode != VK_RETURN && vkCode != VK_V && vkCode != VK_INSERT) {
                        byte[] keyState = new byte[256];
                        GetKeyboardState(keyState);
                        StringBuilder charBuffer = new StringBuilder(10);
                        int result = ToUnicode((uint)vkCode, 0, keyState, charBuffer, charBuffer.Capacity, 0);
                        if (result > 0) {
                            if (_buffer.Length + charBuffer.Length <= MAX_INPUT_LENGTH) _buffer.Append(charBuffer.ToString());
                            else _bufferOverflow = true;
                        }
                    }
                } else {
                    _foregroundTarget = IntPtr.Zero;
                    _bufferTarget = "";
                    if (_buffer.Length > 0) _buffer.Clear();
                    _bufferOverflow = false;
                }
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && wParam == (IntPtr)WM_LBUTTONDOWN) {
            uint flags = unchecked((uint)Marshal.ReadInt32(lParam, 12));
            if ((flags & LLMHF_INJECTED) != 0) {
                return CallNextHookEx(_mouseHookID, nCode, wParam, lParam);
            }
            if (Volatile.Read(ref _decisionPending) != 0) return (IntPtr)1;

            IntPtr hwnd = GetForegroundWindow();
            string target = GetTargetName(hwnd);
            if (target.Length > 0 && Interlocked.CompareExchange(ref _decisionPending, 1, 0) == 0) {
                int x = Marshal.ReadInt32(lParam, 0);
                int y = Marshal.ReadInt32(lParam, 4);
                QueueInputRequest("PROMPT_REQUEST", target, hwnd, "click", x, y);
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(_mouseHookID, nCode, wParam, lParam);
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Windows.Forms, UIAutomationClient, UIAutomationTypes, WindowsBase, System.Web.Extensions -ErrorAction Stop
[KryptonInputGuard]::Start()
`;

      scriptPath = path.join(os.tmpdir(), `krypton-input-guard-${process.pid}.ps1`);
      fsSync.writeFileSync(scriptPath, psScript, 'utf8');

      const inputProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-STA',
        '-File',
        scriptPath,
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.inputMonitorProcess = inputProcess;

      let buffer = '';
      inputProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let data: NativeInputMessage;
          try {
            data = JSON.parse(trimmed) as NativeInputMessage;
          } catch (error) {
            console.warn('[WindowsProtectionAgent] Ignored malformed input-monitor message:', error);
            continue;
          }
          if (!data || typeof data !== 'object') continue;
          try {
            if (data.type === 'READY') {
              if (this.inputMonitorProcess === inputProcess) this.inputMonitorReady = true;
            } else if (data.type === 'PROMPT_REQUEST' && typeof data.text === 'string') {
              void this.handleNativePromptRequest(inputProcess, data);
            } else if (data.type === 'PASTE_REQUEST' && typeof data.text === 'string') {
              void this.handleNativePasteRequest(inputProcess, data);
            } else if (data.type === 'OVERSIZE_REQUEST') {
              const targetName = typeof data.target === 'string' ? data.target : 'AI platform';
              const withinSchedule = !this.isScheduleActive || this.isScheduleActive();
              if (withinSchedule) {
                this.blockOversizedInput(targetName);
                this.respondToInputRequest(inputProcess, data.id, false, data.action === 'click' ? 'click' : 'submit');
              } else {
                this.respondToInputRequest(inputProcess, data.id, true, data.action === 'click' ? 'click' : 'submit');
              }
            } else if (data.type === 'ACCESSIBILITY_UNAVAILABLE') {
              const withinSchedule = !this.isScheduleActive || this.isScheduleActive();
              if (withinSchedule) {
                this.notifyWindows(
                  'Krypton DLP: Click blocked',
                  'Krypton could not verify this AI-platform control using Windows accessibility, so the click was blocked.',
                );
              }
              this.respondToInputRequest(inputProcess, data.id, !withinSchedule, 'click');
            }
          } catch (error) {
            console.error('[WindowsProtectionAgent] Could not process native input request:', error);
            this.respondToInputRequest(
              inputProcess,
              data.id,
              false,
              data.action === 'click' ? 'click' : data.type === 'PASTE_REQUEST' ? 'paste' : 'submit',
            );
          }
        }
      });

      inputProcess.stderr?.on('data', (chunk: Buffer) => {
        console.warn('[WindowsProtectionAgent] Input monitor:', chunk.toString('utf8').trim());
      });

      inputProcess.on('error', (err) => {
        console.warn('[WindowsProtectionAgent] Input monitor error:', err.message);
        if (this.inputMonitorProcess === inputProcess) {
          this.inputMonitorProcess = null;
          this.inputMonitorReady = false;
        }
      });

      inputProcess.on('exit', () => {
        if (scriptPath) {
          try {
            fsSync.unlinkSync(scriptPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              console.warn('[WindowsProtectionAgent] Could not remove temporary input-guard script:', error);
            }
          }
        }
        if (this.inputMonitorProcess === inputProcess) {
          this.inputMonitorProcess = null;
          this.inputMonitorReady = false;
        }
      });
    } catch (error) {
      if (scriptPath) {
        try {
          fsSync.unlinkSync(scriptPath);
        } catch (cleanupError) {
          if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn('[WindowsProtectionAgent] Could not remove temporary input-guard script:', cleanupError);
          }
        }
      }
      console.warn(
        '[WindowsProtectionAgent] Could not start input monitor:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  public stopInputMonitor(): void {
    this.inputMonitorReady = false;
    if (this.inputMonitorProcess) {
      try {
        this.inputMonitorProcess.kill();
      } catch {
        // Ignore
      }
      this.inputMonitorProcess = null;
    }
  }

  private respondToInputRequest(
    inputProcess: ChildProcess,
    id: unknown,
    allow: boolean,
    action: 'submit' | 'paste' | 'click',
  ): void {
    if (typeof id !== 'number' || !inputProcess.stdin?.writable) return;
    inputProcess.stdin.write(`${JSON.stringify({ id, allow, action })}\n`, (error) => {
      if (error) {
        console.warn('[WindowsProtectionAgent] Could not return the input decision:', error.message);
      }
    });
  }

  private async handleNativePromptRequest(inputProcess: ChildProcess, data: NativeInputMessage): Promise<void> {
    const action = data.action === 'click' ? 'click' : 'submit';
    const targetName = typeof data.target === 'string' ? data.target : 'AI platform';
    try {
      const { blocked, result } = this.inspectTypedPrompt(data.text || '', targetName);
      if (blocked || result.action !== 'warn' || !result.hasRisk) {
        this.respondToInputRequest(inputProcess, data.id, !blocked, action);
        return;
      }

      if (
        action === 'submit' &&
        this.pendingWarningApproval?.targetName === targetName &&
        this.pendingWarningApproval.text === data.text
      ) {
        this.pendingWarningApproval = null;
        this.allowedCount++;
        this.respondToInputRequest(inputProcess, data.id, true, action);
        return;
      }
      if (action === 'submit') this.pendingWarningApproval = null;

      const allowed = await this.requestWarningDecision(targetName, result);
      this.recordWarningDecision(targetName, result, allowed);
      this.respondToInputRequest(inputProcess, data.id, allowed, action);
    } catch (error) {
      console.error('[WindowsProtectionAgent] Prompt decision failed; blocking submission:', error);
      this.respondToInputRequest(inputProcess, data.id, false, action);
    }
  }

  private async handleNativePasteRequest(inputProcess: ChildProcess, data: NativeInputMessage): Promise<void> {
    this.pendingWarningApproval = null;
    try {
      const targetName = typeof data.target === 'string' ? data.target : 'Windows AI Clipboard / Desktop App';
      const { blocked, result } = this.inspectClipboard(data.text || '', targetName);
      if (blocked || result.action !== 'warn' || !result.hasRisk) {
        this.respondToInputRequest(inputProcess, data.id, !blocked, 'paste');
        return;
      }

      const allowed = await this.requestWarningDecision(targetName, result);
      this.recordWarningDecision(targetName, result, allowed);
      this.pendingWarningApproval = allowed
        ? { targetName, text: data.text || '' }
        : null;
      this.respondToInputRequest(inputProcess, data.id, allowed, 'paste');
    } catch (error) {
      console.error('[WindowsProtectionAgent] Paste decision failed; blocking paste:', error);
      this.respondToInputRequest(inputProcess, data.id, false, 'paste');
    }
  }

  private async requestWarningDecision(targetName: string, result: PromptScanResult): Promise<boolean> {
    if (!this.scanner.allowsEmployeeWarningBypass() || !this.onWarning) {
      await this.onWarning?.({
        targetName,
        ruleName: result.matches[0]?.ruleName || 'Sensitive content',
        riskLevel: result.highestRisk,
      });
      return false;
    }

    return this.onWarning({
      targetName,
      ruleName: result.matches[0]?.ruleName || 'Sensitive content',
      riskLevel: result.highestRisk,
    });
  }

  private recordWarningDecision(targetName: string, result: PromptScanResult, allowed: boolean): void {
    const primaryMatch = result.matches[0];
    const timestamp = new Date().toISOString();
    const eventRecord: SecurityEventRecord = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      targetName: `AI Prompt: ${targetName}`,
      actionTaken: allowed ? 'allow' : 'block',
      riskLevel: result.highestRisk,
      ruleCode: primaryMatch?.ruleCode || 'WARNING_DECISION',
      ruleName: primaryMatch?.ruleName || 'Sensitive content warning',
      summary: allowed
        ? `Employee allowed a warning-level prompt on ${targetName}`
        : `Employee blocked a warning-level prompt on ${targetName}`,
    };
    if (allowed) this.allowedCount++;
    else this.blockedCount++;
    this.addRecentEvent(eventRecord);
    this.onReportEvent?.({
      targetApp: targetName,
      riskLevel: result.highestRisk,
      ruleCode: eventRecord.ruleCode,
      ruleName: eventRecord.ruleName,
      actionTaken: allowed ? 'allow' : 'block',
      warningResponse: allowed ? 'proceeded' : 'dismissed',
      redactedPreview: result.redactedPrompt?.slice(0, 500),
      timestamp,
    });
  }

  private blockOversizedInput(targetName: string): void {
    const ruleName = 'Input exceeded the local scan limit';
    const ruleCode = 'INPUT_TOO_LARGE';
    const timestamp = new Date().toISOString();
    this.scannedCount++;
    this.blockedCount++;
    this.addRecentEvent({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      targetName: `Typed Prompt: ${targetName}`,
      actionTaken: 'block',
      riskLevel: 'CRITICAL',
      ruleCode,
      ruleName,
      summary: `Blocked oversized input for ${targetName} without sending its content for scanning`,
    });
    this.notifyWindows(
      'Krypton DLP: Input blocked',
      'This text is too large to scan locally and was not submitted.',
    );
    this.onReportEvent?.({
      targetApp: targetName,
      riskLevel: 'CRITICAL',
      ruleCode,
      ruleName,
      actionTaken: 'block',
      redactedPreview: '[Input exceeded the local scan limit]',
      timestamp,
    });
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

    const normalizedTarget = targetName.toLowerCase();
    const targetEnabled = targetName === 'Live DLP Tester' || this.targets.some((target) =>
      target.enabled && (
        normalizedTarget.includes(target.id) ||
        normalizedTarget.includes(target.category.toLowerCase()) ||
        normalizedTarget.includes(target.name.toLowerCase()) ||
        normalizedTarget.includes(target.domain)
      ),
    );
    if (!targetEnabled) {
      return {
        blocked: false,
        result: {
          hasRisk: false,
          highestRisk: 'LOW',
          action: 'allow',
          matches: [],
          redactedPrompt: text,
          explanation: 'Target platform is disabled.',
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

    if (result.hasRisk && result.action === 'warn') {
      return { blocked: false, result };
    }

    this.allowedCount++;
    return { blocked: false, result };
  }

  public inspectClipboard(text: string, targetName = 'Windows AI Clipboard / Desktop App'): { blocked: boolean; result: PromptScanResult } {
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

    const result = this.scanner.scan(text);
    this.scannedCount++;

    if (result.hasRisk && result.action === 'block') {
      this.blockedCount++;
      const topMatch = result.matches[0];
      const eventRecord: SecurityEventRecord = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        targetName,
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
          targetApp: targetName,
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

    if (result.hasRisk && result.action === 'warn') {
      return { blocked: false, result };
    }

    this.allowedCount++;
    return { blocked: false, result };
  }

  public toggleActive(enabled: boolean): boolean {
    this.active = enabled;
    if (enabled) {
      this.startAllMonitors();
    } else {
      this.stopAllMonitors();
    }
    return this.active;
  }

  public isActive(): boolean {
    return this.active;
  }

  public setTargetEnabled(targetId: string, enabled: boolean): void {
    const target = this.targets.find((t) => t.id === targetId);
    if (!target || target.enabled === enabled) return;

    target.enabled = enabled;
    if (this.active && process.platform === 'win32') {
      this.stopInputMonitor();
      this.startInputMonitor();
    }
  }

  public getSummary(): WindowsProtectionSummary {
    return {
      active: this.active,
      platform: process.platform,
      noExtensionRequired: false,
      inputMonitorReady: this.inputMonitorReady,
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
