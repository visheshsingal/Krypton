const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(desktopRoot, 'package.json'));
const releaseDir = path.join(desktopRoot, 'release');
const downloadsDir = path.resolve(desktopRoot, '../public/downloads');
const manifestPath = path.join(downloadsDir, 'macos-release.json');
const appName = 'Krypton AI Security.app';
const architectures = ['arm64', 'x64'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function requireReleaseCredentials() {
  if (process.platform !== 'darwin') {
    throw new Error('A macOS host is required to create and verify a signed Mac release.');
  }

  const identities = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
  if (identities.error) throw identities.error;

  const signingConfigured =
    Boolean(process.env.CSC_LINK || process.env.CSC_NAME) ||
    (identities.status === 0 && identities.stdout.includes('Developer ID Application:'));
  if (!signingConfigured) {
    throw new Error(
      'No Developer ID Application signing identity found. Install the certificate in the login keychain or configure CSC_LINK/CSC_NAME.'
    );
  }

  const apiKeyConfigured =
    process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;
  const appleIdConfigured =
    process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID;
  const keychainProfileConfigured = process.env.APPLE_KEYCHAIN_PROFILE;
  if (!apiKeyConfigured && !appleIdConfigured && !keychainProfileConfigured) {
    throw new Error(
      'Apple notarization credentials are missing. Configure App Store Connect API credentials, Apple ID plus app-specific password and team ID, or APPLE_KEYCHAIN_PROFILE.'
    );
  }
}

function verifyDmg(dmgPath) {
  run('hdiutil', ['verify', dmgPath]);
  const mountPath = fs.mkdtempSync(path.join(os.tmpdir(), 'krypton-macos-'));
  let attached = false;
  try {
    run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountPath, dmgPath]);
    attached = true;
    const appPath = path.join(mountPath, appName);
    if (!fs.existsSync(appPath)) throw new Error(`The installer is missing ${appName}.`);
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
    run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  } finally {
    if (attached) {
      run('hdiutil', ['detach', mountPath]);
    }
    fs.rmSync(mountPath, { recursive: true, force: true });
  }
}

function main() {
  requireReleaseCredentials();
  const nativeDnsProxy = path.join(desktopRoot, 'native/macos/KryptonDNSProxy.appex');
  if (!fs.existsSync(nativeDnsProxy)) {
    throw new Error(
      'The macOS Network Extension DNS proxy is not implemented or embedded. Refusing to publish an installer that could imply website protection is active.'
    );
  }
  run('npm', ['run', 'build']);
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(downloadsDir, { recursive: true });

  const builtDmgPaths = [];
  for (const architecture of architectures) {
    run('npx', [
      'electron-builder',
      '--mac',
      'dmg',
      `--${architecture}`,
      '--config',
      'electron-builder.yml',
    ]);

    const dmgName = `Krypton-macOS-${packageJson.version}-${architecture}.dmg`;
    const sourcePath = path.join(releaseDir, dmgName);
    if (!fs.existsSync(sourcePath)) throw new Error(`Expected build output was not created: ${sourcePath}`);
    verifyDmg(sourcePath);
    builtDmgPaths.push({ dmgName, sourcePath });
  }

  for (const { dmgName, sourcePath } of builtDmgPaths) {
    fs.copyFileSync(sourcePath, path.join(downloadsDir, dmgName));
    console.log(`Verified and published ${dmgName}`);
  }

  const manifest = {
    available: true,
    releaseStatus: 'signed-notarized-and-gatekeeper-verified',
    version: packageJson.version,
    architectures: Object.fromEntries(
      builtDmgPaths.map(({ dmgName }) => {
        const architecture = dmgName.includes('-arm64.') ? 'appleSilicon' : 'intel';
        const downloadPath = path.join(downloadsDir, dmgName);
        const contents = fs.readFileSync(downloadPath);
        return [
          architecture,
          {
            architecture: architecture === 'appleSilicon' ? 'arm64' : 'x64',
            installerName: dmgName,
            downloadUrl: `/downloads/${dmgName}`,
            fileSizeBytes: contents.length,
            sha256Checksum: crypto.createHash('sha256').update(contents).digest('hex'),
          },
        ];
      })
    ),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Wrote verified Mac installer metadata to public/downloads/macos-release.json');
}

try {
  main();
} catch (error) {
  console.error(`[Mac Release] ${error.message}`);
  process.exitCode = 1;
}
