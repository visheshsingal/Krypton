import { strToU8, zipSync } from 'fflate';
import { readVerifiedExtensionFiles } from './extension-package';

describe('Verified extension archive reader', () => {
  test('accepts only the expected files and returns their bytes without writing paths', () => {
    const archive = zipSync({
      'content.js': strToU8('extension code'),
      'assets/': new Uint8Array(),
      'assets/worker.js': strToU8('worker code'),
    });

    const files = readVerifiedExtensionFiles(archive, ['content.js', 'assets/worker.js'], ['assets'], 1024);

    expect(Object.keys(files).sort()).toEqual(['assets/worker.js', 'content.js']);
    expect(new TextDecoder().decode(files['content.js'])).toBe('extension code');
  });

  test('rejects unexpected traversal paths before unpacking', () => {
    const archive = zipSync({
      '../outside.js': strToU8('not allowed'),
    });

    expect(() => readVerifiedExtensionFiles(archive, ['content.js'], [], 1024))
      .toThrow('The extension ZIP contains missing, duplicate, or unexpected paths.');
  });

  test('rejects oversized declared entries before decompression', () => {
    const archive = zipSync({ 'content.js': strToU8('extension code') });
    const centralDirectoryOffset = archive.findIndex((value, index) =>
      value === 0x50 &&
      archive[index + 1] === 0x4b &&
      archive[index + 2] === 0x01 &&
      archive[index + 3] === 0x02,
    );
    expect(centralDirectoryOffset).toBeGreaterThanOrEqual(0);
    new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
      .setUint32(centralDirectoryOffset + 24, 16 * 1024 * 1024, true);

    expect(() => readVerifiedExtensionFiles(archive, ['content.js'], [], 1024))
      .toThrow('The extension ZIP contains an encrypted, oversized, or unsupported entry.');
  });
});
