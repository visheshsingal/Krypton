import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    platform: 'Windows',
    architecture: 'x64',
    appVersion: '1.0.0',
    installerName: 'Krypton-Security-Setup-1.0.0.exe',
    downloadUrl: '/downloads/Krypton-Security-Setup-1.0.0.exe',
    fileSizeBytes: 79563773,
    sha256Checksum: '32d0f126d08eff60c9794a1b09df08af57ade5b0d782953180a443d7ebd230a2',
    releaseDate: '2026-10-28',
    minimumRequirements: {
      os: 'Windows 10 / 11 (64-bit)',
      ram: '4 GB minimum, 8 GB recommended',
      disk: '250 MB free disk space',
    },
    downloads: {
      windows: {
        architecture: 'x64',
        installerName: 'Krypton-Security-Setup-1.0.0.exe',
        downloadUrl: '/downloads/Krypton-Security-Setup-1.0.0.exe',
        fileSizeBytes: 79563773,
        sha256Checksum: '32d0f126d08eff60c9794a1b09df08af57ade5b0d782953180a443d7ebd230a2',
      },
      macos: {
        architectures: {
          appleSilicon: {
            architecture: 'arm64',
            installerName: 'Krypton-macOS-1.0.0-arm64.dmg',
            downloadUrl: '/downloads/Krypton-macOS-1.0.0-arm64.dmg',
            fileSizeBytes: 98516172,
            sha256Checksum: 'd16571a3b243037ca2fefc312806fd589f4b1651a669f525d7a7e1b0aa91b147',
          },
          intel: {
            architecture: 'x64',
            installerName: 'Krypton-macOS-1.0.0-x64.tar.xz',
            downloadUrl: '/downloads/Krypton-macOS-1.0.0-x64.tar.xz',
            fileSizeBytes: 75298804,
            sha256Checksum: '23086468b600e7a781b940bd8ac33a3ea5b6dd6d475b9d58fc917ba4308d1c73',
          },
        },
      },
    },
    documentationUrl: '/docs/windows-deployment',
  });
}
