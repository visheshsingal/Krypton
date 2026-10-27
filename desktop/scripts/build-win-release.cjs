const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(desktopRoot, 'package.json'));
const releaseDir = path.join(desktopRoot, 'release');
const downloadsDir = path.resolve(desktopRoot, '../public/downloads');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function isWindowsExecutable(filePath) {
  const header = Buffer.alloc(64);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    if (fs.readSync(descriptor, header, 0, header.length, 0) < header.length) return false;
    if (header.toString('ascii', 0, 2) !== 'MZ') return false;
    const peOffset = header.readUInt32LE(0x3c);
    const signature = Buffer.alloc(4);
    return fs.readSync(descriptor, signature, 0, signature.length, peOffset) === 4 &&
      signature.toString('binary') === 'PE\u0000\u0000';
  } finally {
    fs.closeSync(descriptor);
  }
}

function main() {
  run('npm', ['run', 'build']);
  const mainBundle = fs.readFileSync(path.join(desktopRoot, 'dist-electron/main/main.js'), 'utf8');
  if (!mainBundle.includes('https://krypton-ten-theta.vercel.app/api')) {
    throw new Error('Production Vercel API endpoint was not embedded in the desktop app.');
  }

  run('npx', [
    'electron-builder',
    '--win',
    'nsis',
    '--x64',
    '--config',
    'electron-builder.yml',
  ]);

  const installerName = `Krypton-Security-Setup-${packageJson.version}.exe`;
  const sourcePath = path.join(releaseDir, installerName);
  const appBundle = path.join(releaseDir, 'win-unpacked/resources/app.asar');
  if (!fs.existsSync(sourcePath) || !isWindowsExecutable(sourcePath)) {
    throw new Error(`A valid Windows PE installer was not created: ${sourcePath}`);
  }
  if (!fs.existsSync(appBundle)) {
    throw new Error('The packaged Windows app is missing resources/app.asar.');
  }

  fs.mkdirSync(downloadsDir, { recursive: true });
  const downloadPath = path.join(downloadsDir, installerName);
  fs.copyFileSync(sourcePath, downloadPath);
  const contents = fs.readFileSync(downloadPath);
  const manifest = {
    available: true,
    releaseStatus: 'built-unsigned',
    version: packageJson.version,
    architecture: 'x64',
    installerName,
    downloadUrl: `/downloads/${installerName}`,
    fileSizeBytes: contents.length,
    sha256Checksum: crypto.createHash('sha256').update(contents).digest('hex'),
  };
  fs.writeFileSync(
    path.join(downloadsDir, 'windows-release.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(`Created Windows installer and metadata in ${downloadsDir}`);
}

try {
  main();
} catch (error) {
  console.error(`[Windows Release] ${error.message}`);
  process.exitCode = 1;
}
