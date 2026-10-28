export type WindowsReleaseManifest = {
  available: true;
  version: string;
  architecture: 'x64';
  installerName: string;
  installerDownloadUrl: string;
  installerSha256Checksum: string;
  signatureStatus?: string;
};

export function compareAppVersions(currentVersion: string, latestVersion: string): number {
  const parse = (version: string): number[] | null => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
    return version.split('.').map(Number);
  };

  const current = parse(currentVersion);
  const latest = parse(latestVersion);
  if (!current || !latest) throw new Error('Release versions must use the x.y.z format.');

  for (let index = 0; index < 3; index += 1) {
    if (latest[index] > current[index]) return 1;
    if (latest[index] < current[index]) return -1;
  }
  return 0;
}

export function parseWindowsReleaseManifest(value: unknown): WindowsReleaseManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The update information is invalid.');
  }
  const manifest = value as Record<string, unknown>;
  const version = typeof manifest.version === 'string' ? manifest.version : '';
  const installerName = `Krypton-Security-Setup-${version}.exe`;
  const installerDownloadUrl = typeof manifest.installerDownloadUrl === 'string'
    ? manifest.installerDownloadUrl
    : '';
  const installerSha256Checksum = typeof manifest.installerSha256Checksum === 'string'
    ? manifest.installerSha256Checksum
    : '';
  if (
    manifest.available !== true ||
    manifest.architecture !== 'x64' ||
    !/^\d+\.\d+\.\d+$/.test(version) ||
    manifest.installerName !== installerName ||
    installerDownloadUrl !== `/downloads/${installerName}` ||
    !/^[a-f0-9]{64}$/i.test(installerSha256Checksum)
  ) {
    throw new Error('The latest Windows update is not available or its release information is invalid.');
  }

  return {
    available: true,
    version,
    architecture: 'x64',
    installerName,
    installerDownloadUrl,
    installerSha256Checksum,
    signatureStatus: typeof manifest.signatureStatus === 'string' ? manifest.signatureStatus : undefined,
  };
}
