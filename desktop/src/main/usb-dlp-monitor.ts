import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type UsbVolume = {
  driveLetter: string;
  volumeLabel: string;
  sizeBytes: number | null;
  freeBytes: number | null;
  deviceModel: string | null;
  deviceSerial: string | null;
};

export type UsbActivityEvent = {
  eventType: 'device_connected' | 'device_disconnected' | 'file_write_observed';
  timestamp: string;
  windowsUser: string;
  driveLetter: string;
  volumeLabel: string;
  deviceModel: string | null;
  deviceSerial: string | null;
  fileName: string | null;
  extension: string | null;
  sizeBytes: number | null;
  sourcePath: null;
  destinationPath: string | null;
  transferStatus: 'connected' | 'disconnected' | 'destination_write_observed';
  suspicious: boolean;
  alertReasons: string[];
};

export type UsbMonitorStatus = {
  enabled: boolean;
  active: boolean;
  platform: string;
  connectedDevices: number;
  lastEventAt: string | null;
  error: string | null;
};

type MonitorOptions = {
  platform?: string;
  userName?: string;
  enumerateVolumes?: () => Promise<UsbVolume[]>;
  watchDirectory?: typeof fs.watch;
  statFile?: typeof fs.promises.lstat;
  onEvent: (event: UsbActivityEvent) => Promise<void> | void;
  onStatus?: (status: UsbMonitorStatus) => void;
  pollIntervalMs?: number;
  settleDelayMs?: number;
  now?: () => Date;
};

type WatchedVolume = {
  volume: UsbVolume;
  watcher: fs.FSWatcher;
};

const POWERSHELL_QUERY = [
  "$ErrorActionPreference = 'Stop'",
  "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | ForEach-Object {",
  '  $logical = $_',
  '  $partitions = Get-CimAssociatedInstance -InputObject $logical -Association Win32_LogicalDiskToPartition',
  '  $disk = $null',
  '  foreach ($partition in $partitions) {',
  '    $disk = Get-CimAssociatedInstance -InputObject $partition -Association Win32_DiskDriveToDiskPartition | Select-Object -First 1',
  '    if ($disk) { break }',
  '  }',
  '  [pscustomobject]@{ DriveLetter=$logical.DeviceID; VolumeLabel=$logical.VolumeName; SizeBytes=$logical.Size; FreeBytes=$logical.FreeSpace; DeviceModel=$disk.Model; DeviceSerial=$disk.SerialNumber }',
  '} | ConvertTo-Json -Compress',
].join('; ');

export function parseUsbVolumes(json: string): UsbVolume[] {
  if (!json.trim()) return [];
  const parsed: unknown = JSON.parse(json);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.flatMap((entry): UsbVolume[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const driveLetter = typeof raw.DriveLetter === 'string' ? raw.DriveLetter.trim() : '';
    if (!/^[A-Z]:$/i.test(driveLetter)) return [];
    const numberOrNull = (value: unknown) => {
      if (value === null || value === undefined || value === '') return null;
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : null;
    };
    const stringOrNull = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
    return [{
      driveLetter: driveLetter.toUpperCase(),
      volumeLabel: stringOrNull(raw.VolumeLabel) || '',
      sizeBytes: numberOrNull(raw.SizeBytes),
      freeBytes: numberOrNull(raw.FreeBytes),
      deviceModel: stringOrNull(raw.DeviceModel),
      deviceSerial: stringOrNull(raw.DeviceSerial),
    }];
  });
}

export function getUsbAlertReasons(extension: string, sizeBytes: number, recentWrites: number): string[] {
  const reasons: string[] = [];
  if (['.env', '.pem', '.key', '.p12', '.pfx', '.kdbx', '.ppk'].includes(extension.toLowerCase())) {
    reasons.push('Sensitive file type');
  }
  if (sizeBytes >= 100 * 1024 * 1024) reasons.push('Large file (100 MB or more)');
  if (recentWrites >= 20) reasons.push('High-volume USB writes');
  return reasons;
}

export function getUsbFileExtension(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName === '.env' || lowerName.startsWith('.env.')) return '.env';
  if (lowerName.startsWith('.') && lowerName.indexOf('.', 1) === -1) return lowerName.slice(0, 32);
  return path.win32.extname(fileName).toLowerCase().slice(0, 32);
}

export function enumerateRemovableUsbVolumes(): Promise<UsbVolume[]> {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('USB storage monitoring is supported on Windows only.'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      POWERSHELL_QUERY,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 256 * 1024) child.kill();
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 16 * 1024) child.kill();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Could not query removable USB drives${stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : '.'}`));
        return;
      }
      try {
        resolve(parseUsbVolumes(stdout));
      } catch {
        reject(new Error('Windows returned invalid removable-drive metadata.'));
      }
    });
  });
}

export class UsbDlpMonitor {
  private readonly options: Required<Pick<MonitorOptions, 'platform' | 'userName' | 'pollIntervalMs' | 'settleDelayMs' | 'now'>> &
    Omit<MonitorOptions, 'platform' | 'userName' | 'pollIntervalMs' | 'settleDelayMs' | 'now'>;
  private readonly watchers = new Map<string, WatchedVolume>();
  private readonly settleTimers = new Map<string, NodeJS.Timeout>();
  private readonly recentWrites: number[] = [];
  private enabled = false;
  private polling = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastEventAt: string | null = null;
  private monitorError: string | null = null;
  private uploadError: string | null = null;

  constructor(options: MonitorOptions) {
    this.options = {
      ...options,
      platform: options.platform || process.platform,
      userName: options.userName || os.userInfo().username,
      pollIntervalMs: options.pollIntervalMs ?? 4000,
      settleDelayMs: options.settleDelayMs ?? 1200,
      now: options.now || (() => new Date()),
    };
  }

  public getStatus(): UsbMonitorStatus {
    return {
      enabled: this.enabled,
      active: this.enabled && this.options.platform === 'win32' && this.monitorError === null && this.uploadError === null,
      platform: this.options.platform,
      connectedDevices: this.watchers.size,
      lastEventAt: this.lastEventAt,
      error: this.uploadError || this.monitorError,
    };
  }

  public async setEnabled(enabled: boolean): Promise<UsbMonitorStatus> {
    if (enabled && this.enabled) return this.getStatus();
    if (!enabled) {
      this.enabled = false;
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.closeWatchers();
      this.monitorError = null;
      this.uploadError = null;
      this.publishStatus();
      return this.getStatus();
    }

    if (this.options.platform !== 'win32') {
      throw new Error('USB storage monitoring is available on Windows only.');
    }
    if (!this.options.enumerateVolumes) {
      throw new Error('Removable-drive enumeration is not configured.');
    }

    this.enabled = true;
    this.monitorError = null;
    this.uploadError = null;
    try {
      await this.poll();
      this.pollTimer = setInterval(() => {
        void this.poll().catch((error: unknown) => this.setMonitorError(error));
      }, this.options.pollIntervalMs);
      this.publishStatus();
      return this.getStatus();
    } catch (error) {
      this.enabled = false;
      this.closeWatchers();
      this.setMonitorError(error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    await this.setEnabled(false);
  }

  public setUnavailable(reason: string): void {
    this.monitorError = reason;
    this.publishStatus();
  }

  private async poll(): Promise<void> {
    if (!this.enabled || this.polling || !this.options.enumerateVolumes) return;
    this.polling = true;
    try {
      const volumes = await this.options.enumerateVolumes();
      const current = new Map(volumes.map((volume) => [volume.driveLetter, volume]));

      for (const [driveLetter, watched] of this.watchers) {
        const latestVolume = current.get(driveLetter);
        const volumeChanged = latestVolume && (
          watched.volume.deviceSerial !== latestVolume.deviceSerial ||
          watched.volume.deviceModel !== latestVolume.deviceModel ||
          watched.volume.volumeLabel !== latestVolume.volumeLabel
        );
        if (!latestVolume || volumeChanged) {
          watched.watcher.close();
          this.watchers.delete(driveLetter);
          this.cancelVolumeTimers(driveLetter);
          await this.emit({
            eventType: 'device_disconnected',
            timestamp: this.options.now().toISOString(),
            windowsUser: this.options.userName,
            driveLetter,
            volumeLabel: watched.volume.volumeLabel,
            deviceModel: watched.volume.deviceModel,
            deviceSerial: watched.volume.deviceSerial,
            fileName: null,
            extension: null,
            sizeBytes: null,
            sourcePath: null,
            destinationPath: null,
            transferStatus: 'disconnected',
            suspicious: false,
            alertReasons: [],
          });
        }
      }

      for (const [driveLetter, volume] of current) {
        if (this.watchers.has(driveLetter)) continue;
        this.watchVolume(volume);
        await this.emit({
          eventType: 'device_connected',
          timestamp: this.options.now().toISOString(),
          windowsUser: this.options.userName,
          driveLetter,
          volumeLabel: volume.volumeLabel,
          deviceModel: volume.deviceModel,
          deviceSerial: volume.deviceSerial,
          fileName: null,
          extension: null,
          sizeBytes: null,
          sourcePath: null,
          destinationPath: null,
          transferStatus: 'connected',
          suspicious: false,
          alertReasons: [],
        });
      }
      this.monitorError = null;
    } finally {
      this.polling = false;
      this.publishStatus();
    }
  }

  private watchVolume(volume: UsbVolume): void {
    const watchDirectory = this.options.watchDirectory || fs.watch;
    const pathApi = this.options.platform === 'win32' ? path.win32 : path;
    const rootPath = `${volume.driveLetter}${pathApi.sep}`;
    const watcher = watchDirectory(rootPath, { recursive: true }, (_eventType, fileName) => {
      if (typeof fileName !== 'string' || !fileName.trim()) {
        this.setMonitorError('Windows reported a USB file change without a file name; that change was not recorded.');
        return;
      }
      const fullPath = pathApi.resolve(rootPath, fileName);
      const relativePath = pathApi.relative(rootPath, fullPath);
      if (!relativePath || relativePath.startsWith('..') || pathApi.isAbsolute(relativePath)) return;
      this.scheduleFileObservation(volume, fullPath);
    });
    watcher.on('error', (error) => {
      this.setMonitorError(`USB drive ${volume.driveLetter} could not be monitored: ${error.message}`);
    });
    this.watchers.set(volume.driveLetter, { volume, watcher });
  }

  private scheduleFileObservation(volume: UsbVolume, fullPath: string): void {
    const previousTimer = this.settleTimers.get(fullPath);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      this.settleTimers.delete(fullPath);
      void this.observeFile(volume, fullPath).catch((error: unknown) => this.setMonitorError(error));
    }, this.options.settleDelayMs);
    this.settleTimers.set(fullPath, timer);
  }

  private async observeFile(volume: UsbVolume, fullPath: string): Promise<void> {
    const lstat = this.options.statFile || fs.promises.lstat;
    let details: Awaited<ReturnType<typeof fs.promises.lstat>>;
    try {
      details = await lstat(fullPath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    if (!details.isFile() || details.isSymbolicLink()) return;

    const pathApi = this.options.platform === 'win32' ? path.win32 : path;
    const fileName = pathApi.basename(fullPath).slice(0, 260);
    const extension = getUsbFileExtension(fileName);
    const now = this.options.now();
    this.recentWrites.push(now.getTime());
    while (this.recentWrites.length && now.getTime() - this.recentWrites[0] > 60_000) {
      this.recentWrites.shift();
    }
    const alertReasons = getUsbAlertReasons(extension, details.size, this.recentWrites.length);
    await this.emit({
      eventType: 'file_write_observed',
      timestamp: now.toISOString(),
      windowsUser: this.options.userName,
      driveLetter: volume.driveLetter,
      volumeLabel: volume.volumeLabel,
      deviceModel: volume.deviceModel,
      deviceSerial: volume.deviceSerial,
      fileName,
      extension,
      sizeBytes: details.size,
      sourcePath: null,
      destinationPath: fullPath.slice(0, 1024),
      transferStatus: 'destination_write_observed',
      suspicious: alertReasons.length > 0,
      alertReasons,
    });
  }

  private async emit(event: UsbActivityEvent): Promise<void> {
    this.lastEventAt = event.timestamp;
    try {
      await this.options.onEvent(event);
      this.uploadError = null;
    } catch (error) {
      this.uploadError = error instanceof Error ? error.message : 'USB activity could not be uploaded.';
      this.publishStatus();
    }
  }

  private setMonitorError(error: unknown): void {
    this.monitorError = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'USB monitoring failed unexpectedly.';
    this.publishStatus();
  }

  private publishStatus(): void {
    this.options.onStatus?.(this.getStatus());
  }

  private closeWatchers(): void {
    for (const watched of this.watchers.values()) watched.watcher.close();
    this.watchers.clear();
    for (const timer of this.settleTimers.values()) clearTimeout(timer);
    this.settleTimers.clear();
  }

  private cancelVolumeTimers(driveLetter: string): void {
    const root = `${driveLetter}${path.win32.sep}`.toUpperCase();
    for (const [filePath, timer] of this.settleTimers) {
      if (path.win32.parse(filePath).root.toUpperCase() !== root) continue;
      clearTimeout(timer);
      this.settleTimers.delete(filePath);
    }
  }
}
