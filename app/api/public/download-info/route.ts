import { NextResponse } from 'next/server';
import macOSRelease from '@/public/downloads/macos-release.json';
import windowsRelease from '@/public/downloads/windows-release.json';
import browserExtensionRelease from '@/public/downloads/browser-extension-release.json';

export async function GET() {
  return NextResponse.json({
    platform: 'Windows',
    architecture: 'x64',
    appVersion: '1.0.0',
    installerName: windowsRelease.installerName,
    installerType: windowsRelease.installerType || 'nsis',
    signatureStatus: windowsRelease.signatureStatus || 'unsigned',
    packageName: windowsRelease.packageName || null,
    downloadUrl: windowsRelease.downloadUrl,
    fileSizeBytes: windowsRelease.fileSizeBytes || null,
    sha256Checksum: windowsRelease.sha256Checksum || null,
    available: windowsRelease.available,
    releaseStatus: windowsRelease.releaseStatus,
    releaseDate: '2026-10-28',
    minimumRequirements: {
      os: 'Windows 10 / 11 (64-bit)',
      ram: '4 GB minimum, 8 GB recommended',
      disk: '250 MB free disk space',
    },
    downloads: {
      windows: windowsRelease,
      macos: macOSRelease,
      browserExtension: browserExtensionRelease,
    },
    documentationUrl: '/docs/windows-deployment',
  });
}
