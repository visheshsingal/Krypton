import { compareAppVersions, parseWindowsReleaseManifest } from './app-update';

describe('compareAppVersions', () => {
  it('detects a newer major, minor, or patch release', () => {
    expect(compareAppVersions('1.9.9', '2.0.0')).toBe(1);
    expect(compareAppVersions('1.2.9', '1.3.0')).toBe(1);
    expect(compareAppVersions('1.2.3', '1.2.4')).toBe(1);
  });

  it('recognizes the same release and older releases', () => {
    expect(compareAppVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareAppVersions('2.0.0', '1.99.99')).toBe(-1);
  });

  it('rejects malformed release versions', () => {
    expect(() => compareAppVersions('1.2', '1.2.3')).toThrow('x.y.z');
    expect(() => compareAppVersions('1.2.3', 'latest')).toThrow('x.y.z');
  });
});

describe('parseWindowsReleaseManifest', () => {
  const manifest = {
    available: true,
    version: '1.2.3',
    architecture: 'x64',
    installerName: 'Krypton-Security-Setup-1.2.3.exe',
    installerDownloadUrl: '/downloads/Krypton-Security-Setup-1.2.3.exe',
    installerSha256Checksum: 'a'.repeat(64),
    signatureStatus: 'unsigned',
  };

  it('accepts a versioned Windows installer with a verified release checksum', () => {
    expect(parseWindowsReleaseManifest(manifest)).toEqual(manifest);
  });

  it('rejects external URLs, path traversal, and invalid checksums', () => {
    expect(() => parseWindowsReleaseManifest({ ...manifest, installerDownloadUrl: 'https://other.example/setup.exe' })).toThrow();
    expect(() => parseWindowsReleaseManifest({ ...manifest, installerName: '../setup.exe' })).toThrow();
    expect(() => parseWindowsReleaseManifest({ ...manifest, installerSha256Checksum: 'invalid' })).toThrow();
  });
});
