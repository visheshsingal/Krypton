import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import {
  getUsbAlertReasons,
  getUsbFileExtension,
  parseUsbVolumes,
  UsbActivityEvent,
  UsbDlpMonitor,
  UsbVolume,
} from './usb-dlp-monitor';

class TestWatcher extends EventEmitter {
  public close = jest.fn();
}

const volume: UsbVolume = {
  driveLetter: 'E:',
  volumeLabel: 'WORK',
  sizeBytes: 10_000,
  freeBytes: 5_000,
  deviceModel: 'USB Drive',
  deviceSerial: 'SERIAL-1',
};

afterEach(() => {
  jest.useRealTimers();
});

describe('USB DLP metadata monitoring', () => {
  test('parses only valid removable drive metadata', () => {
    expect(parseUsbVolumes(JSON.stringify({
      DriveLetter: 'e:',
      VolumeLabel: 'Work',
      SizeBytes: '1000',
      FreeBytes: 500,
      DeviceModel: 'USB',
      DeviceSerial: 'serial',
    }))).toEqual([{
      driveLetter: 'E:',
      volumeLabel: 'Work',
      sizeBytes: 1000,
      freeBytes: 500,
      deviceModel: 'USB',
      deviceSerial: 'serial',
    }]);
    expect(parseUsbVolumes(JSON.stringify({ DriveLetter: 'not-a-drive', SizeBytes: 500 }))).toEqual([]);
    expect(parseUsbVolumes('')).toEqual([]);
  });

  test('flags suspicious metadata without inspecting file contents', () => {
    expect(getUsbFileExtension('.env')).toBe('.env');
    expect(getUsbFileExtension('.env.local')).toBe('.env');
    expect(getUsbFileExtension('credentials.PEM')).toBe('.pem');
    expect(getUsbAlertReasons('.pem', 100, 1)).toContain('Sensitive file type');
    expect(getUsbAlertReasons(getUsbFileExtension('.env'), 100, 1)).toContain('Sensitive file type');
    expect(getUsbAlertReasons('.txt', 100 * 1024 * 1024, 1)).toContain('Large file (100 MB or more)');
    expect(getUsbAlertReasons('.txt', 10, 20)).toContain('High-volume USB writes');
    expect(getUsbAlertReasons('.txt', 10, 1)).toEqual([]);
  });

  test('reports attach, destination write metadata, and disconnect', async () => {
    jest.useFakeTimers();
    let connected = true;
    let onChange: ((eventType: string, fileName: string | Buffer | null) => void) | undefined;
    const watcher = new TestWatcher();
    const events: UsbActivityEvent[] = [];
    const monitor = new UsbDlpMonitor({
      platform: 'win32',
      userName: 'employee',
      pollIntervalMs: 100,
      settleDelayMs: 20,
      enumerateVolumes: async () => connected ? [volume] : [],
      watchDirectory: ((_directory: fs.PathLike, _options: fs.WatchOptions, listener: (eventType: string, fileName: string | Buffer | null) => void) => {
        onChange = listener as typeof onChange;
        return watcher as unknown as fs.FSWatcher;
      }) as unknown as typeof fs.watch,
      statFile: (async () => ({
        isFile: () => true,
        isSymbolicLink: () => false,
        size: 128,
      })) as unknown as typeof fs.promises.lstat,
      onEvent: (event) => { events.push(event); },
      now: () => new Date('2025-01-01T00:00:00.000Z'),
    });

    await monitor.setEnabled(true);
    expect(events[0].eventType).toBe('device_connected');
    onChange?.('rename', 'copy.txt');
    await jest.advanceTimersByTimeAsync(20);
    expect(events[1]).toMatchObject({
      eventType: 'file_write_observed',
      fileName: 'copy.txt',
      sizeBytes: 128,
      sourcePath: null,
      destinationPath: 'E:\\copy.txt',
      transferStatus: 'destination_write_observed',
    });

    connected = false;
    await jest.advanceTimersByTimeAsync(100);
    expect(events.at(-1)?.eventType).toBe('device_disconnected');
    expect(watcher.close).toHaveBeenCalled();
    await monitor.stop();
    jest.useRealTimers();
  });

  test('fails explicitly when drive enumeration is denied', async () => {
    const monitor = new UsbDlpMonitor({
      platform: 'win32',
      enumerateVolumes: async () => { throw new Error('Access denied'); },
      onEvent: jest.fn(),
    });
    await expect(monitor.setEnabled(true)).rejects.toThrow('Access denied');
    expect(monitor.getStatus()).toMatchObject({ enabled: false, error: 'Access denied' });
  });

  test('surfaces a removable-drive watcher permission failure', async () => {
    const watcher = new TestWatcher();
    const monitor = new UsbDlpMonitor({
      platform: 'win32',
      enumerateVolumes: async () => [volume],
      watchDirectory: (() => watcher as unknown as fs.FSWatcher) as unknown as typeof fs.watch,
      onEvent: jest.fn(),
    });
    await monitor.setEnabled(true);
    watcher.emit('error', new Error('Access denied'));
    expect(monitor.getStatus()).toMatchObject({
      enabled: true,
      active: false,
      error: 'USB drive E: could not be monitored: Access denied',
    });
    await monitor.stop();
  });
});
