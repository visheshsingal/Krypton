import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const INTERNET_SETTINGS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

export type WindowsProxySnapshot = {
  proxyEnable: string;
  proxyServer: string;
  autoConfigUrl: string;
};

export const EMPTY_PROXY_SNAPSHOT: WindowsProxySnapshot = {
  proxyEnable: '0',
  proxyServer: '',
  autoConfigUrl: '',
};

function parseRegQueryValue(stdout: string, valueName: string): string {
  const line = stdout.split(/\r?\n/).find((entry) => entry.trim().startsWith(valueName));
  if (!line) return '';
  const match = line.match(/REG_(?:SZ|DWORD)\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function readWindowsProxySnapshot(): Promise<WindowsProxySnapshot> {
  const { stdout } = await execFileAsync('reg', ['query', INTERNET_SETTINGS], { windowsHide: true });
  return {
    proxyEnable: parseRegQueryValue(stdout, 'ProxyEnable') || '0',
    proxyServer: parseRegQueryValue(stdout, 'ProxyServer'),
    autoConfigUrl: parseRegQueryValue(stdout, 'AutoConfigURL'),
  };
}

async function writeReg(name: string, type: 'REG_SZ' | 'REG_DWORD', value: string): Promise<void> {
  await execFileAsync('reg', ['add', INTERNET_SETTINGS, '/v', name, '/t', type, '/d', value, '/f'], {
    windowsHide: true,
  });
}

async function deleteReg(name: string): Promise<void> {
  try {
    await execFileAsync('reg', ['delete', INTERNET_SETTINGS, '/v', name, '/f'], { windowsHide: true });
  } catch {
    // Value may already be absent.
  }
}

export async function applyPacAutoConfig(pacUrl: string): Promise<void> {
  await writeReg('AutoConfigURL', 'REG_SZ', pacUrl);
  await writeReg('ProxyEnable', 'REG_DWORD', '1');
  await notifyWinInetRefresh();
}

export async function restoreWindowsProxySnapshot(snapshot: WindowsProxySnapshot): Promise<void> {
  await writeReg('ProxyEnable', 'REG_DWORD', snapshot.proxyEnable === '1' || snapshot.proxyEnable === '0x1' ? '1' : '0');
  if (snapshot.proxyServer) await writeReg('ProxyServer', 'REG_SZ', snapshot.proxyServer);
  else await deleteReg('ProxyServer');
  if (snapshot.autoConfigUrl) await writeReg('AutoConfigURL', 'REG_SZ', snapshot.autoConfigUrl);
  else await deleteReg('AutoConfigURL');
  await notifyWinInetRefresh();
}

export function isOurPacUrl(current: string, expectedPacUrl: string): boolean {
  return current.trim().toLowerCase() === expectedPacUrl.trim().toLowerCase();
}

export async function notifyWinInetRefresh(): Promise<void> {
  const script = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class KryptonWinINet {',
    '  [DllImport("wininet.dll", SetLastError=true)]',
    '  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);',
    '}',
    '"@',
    '[void][KryptonWinINet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)',
    '[void][KryptonWinINet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)',
  ].join('\n');
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    });
  } catch {
    // Refresh is best-effort; Chrome may still pick up PAC on the next request.
  }
}
