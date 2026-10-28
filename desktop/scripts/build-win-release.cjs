const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(desktopRoot, 'package.json'));
const releaseDir = path.join(desktopRoot, 'release');
const downloadsDir = path.resolve(desktopRoot, '../public/downloads');
const manifestPath = path.join(downloadsDir, 'windows-release.json');
const backendManifestPath = path.resolve(desktopRoot, '../backend/src/config/windows-release.json');
const buildResourcesDir = path.join(desktopRoot, 'build-resources');
const sidebarPath = path.join(buildResourcesDir, 'windows-installer-sidebar.bmp');
const iconPath = path.join(buildResourcesDir, 'windows-icon.ico');

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

function createInstallerSidebar(filePath) {
  const width = 164;
  const height = 314;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * height);
  const setPixel = (x, y, red, green, blue) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (height - 1 - y) * rowSize + x * 3;
    pixels[offset] = blue;
    pixels[offset + 1] = green;
    pixels[offset + 2] = red;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const glow = Math.max(0, 1 - Math.hypot(x - 145, y - 10) / 190);
      setPixel(x, y, 5 + glow * 2, 10 + glow * 25, 20 + glow * 42);
    }
  }

  for (let y = 0; y < height; y += 1) setPixel(0, y, 56, 189, 248);
  for (let y = 56; y < 98; y += 1) {
    for (let x = 53; x < 111; x += 1) {
      const dx = x - 82;
      const dy = y - 77;
      const outer = dx * dx + dy * dy < 29 * 29;
      const inner = dx * dx + dy * dy < 20 * 20;
      if (outer && !inner) setPixel(x, y, 56, 189, 248);
      if (Math.abs(dx) < 3 && Math.abs(dy) < 16) setPixel(x, y, 210, 242, 255);
      if (Math.abs(dy) < 3 && Math.abs(dx) < 16) setPixel(x, y, 210, 242, 255);
    }
  }

  const fileHeader = Buffer.alloc(14);
  fileHeader.write('BM', 0);
  fileHeader.writeUInt32LE(54 + pixels.length, 2);
  fileHeader.writeUInt32LE(54, 10);
  const dibHeader = Buffer.alloc(40);
  dibHeader.writeUInt32LE(40, 0);
  dibHeader.writeInt32LE(width, 4);
  dibHeader.writeInt32LE(height, 8);
  dibHeader.writeUInt16LE(1, 12);
  dibHeader.writeUInt16LE(24, 14);
  dibHeader.writeUInt32LE(pixels.length, 20);
  fs.writeFileSync(filePath, Buffer.concat([fileHeader, dibHeader, pixels]));
}

function createWindowsIcon(filePath) {
  const size = 256;
  const pixels = Buffer.alloc(size * size * 4);
  const insidePolygon = (x, y, points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      const intersects = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  };
  const outerShield = [[128, 48], [206, 78], [199, 157], [128, 215], [57, 157], [50, 78]];
  const innerShield = [[128, 65], [187, 87], [181, 148], [128, 192], [75, 148], [69, 87]];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(16 - x, 0, x - 239);
      const dy = Math.max(16 - y, 0, y - 239);
      const rounded = dx * dx + dy * dy <= 52 * 52;
      const inOuter = insidePolygon(x, y, outerShield);
      const inInner = insidePolygon(x, y, innerShield);
      const cross = (x >= 119 && x <= 137 && y >= 88 && y <= 169) ||
        (x >= 90 && x <= 166 && y >= 117 && y <= 136);
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      if (rounded) {
        red = 8; green = 20; blue = 38; alpha = 255;
      }
      if (inOuter) {
        red = 56; green = 189; blue = 248; alpha = 255;
      }
      if (inInner) {
        red = 8; green = 20; blue = 38; alpha = 255;
      }
      if (inInner && cross) {
        red = 186; green = 230; blue = 253; alpha = 255;
      }
      const offset = ((size - 1 - y) * size + x) * 4;
      pixels[offset] = blue;
      pixels[offset + 1] = green;
      pixels[offset + 2] = red;
      pixels[offset + 3] = alpha;
    }
  }

  const dibHeader = Buffer.alloc(40);
  dibHeader.writeUInt32LE(40, 0);
  dibHeader.writeInt32LE(size, 4);
  dibHeader.writeInt32LE(size * 2, 8);
  dibHeader.writeUInt16LE(1, 12);
  dibHeader.writeUInt16LE(32, 14);
  dibHeader.writeUInt32LE(pixels.length, 20);
  const mask = Buffer.alloc(size * Math.ceil(size / 32) * 4);
  const image = Buffer.concat([dibHeader, pixels, mask]);
  const iconHeader = Buffer.alloc(6);
  iconHeader.writeUInt16LE(0, 0);
  iconHeader.writeUInt16LE(1, 2);
  iconHeader.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(22, 12);
  fs.writeFileSync(filePath, Buffer.concat([iconHeader, entry, image]));
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

function getSignatureStatus(installerPath) {
  if (process.platform !== 'win32') {
    return process.env.CSC_LINK || process.env.CSC_NAME ? 'unverified' : 'unsigned';
  }
  const quotedPath = installerPath.replace(/'/g, "''");
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$signature = Get-AuthenticodeSignature -LiteralPath '${quotedPath}'; if ($signature.Status -eq 'Valid') { exit 0 }; if ($signature.Status -eq 'NotSigned') { exit 2 }; Write-Error $signature.StatusMessage; exit 1`,
  ], { encoding: 'utf8' });
  if (result.status === 0) return 'signed';
  if (result.status === 2) return 'unsigned';
  throw new Error(`Windows Authenticode verification failed: ${result.stderr || result.stdout || 'unknown error'}`);
}

async function createWindowsPackage(installerPath, installerName, installerChecksum) {
  const packageName = `Krypton-Windows-x64-${packageJson.version}.zip`;
  const packagePath = path.join(releaseDir, packageName);
  const instructions = [
    'KRYPTON AI SECURITY - WINDOWS INSTALLER',
    '',
    `Version: ${packageJson.version} (64-bit)`,
    'Supported OS: Windows 10 and Windows 11',
    '',
    'INSTALL',
    '1. Extract this ZIP to a folder on your PC.',
    `2. Run ${installerName}.`,
    '3. Follow the setup wizard. Krypton installs for your Windows user and does not require administrator access.',
    '4. Launch Krypton from the Start menu or desktop shortcut and activate with your company credentials.',
    '',
    'UNINSTALL',
    'Open Settings > Apps > Installed apps, select Krypton AI Security, and choose Uninstall.',
    'The uninstaller is created and registered by the setup wizard.',
    '',
    'SECURITY',
    'Krypton does not disable Windows Security, SmartScreen, or other system protections.',
    'Windows may show a publisher warning until the installer is signed with a trusted code-signing certificate.',
    'Verify the installer SHA-256 using SHA256SUMS.txt before running it.',
    '',
    'SCOPE',
    'Prompt scanning is performed in supported Krypton-managed Chrome/Edge profiles only.',
    'Optional USB monitoring is Windows-only and off by default; employees must enable it in the desktop app.',
    'It records removable-drive and destination-file metadata only, never file contents; source paths and copy completion are not reliably available.',
    'See the Krypton website for current product scope and privacy information.',
    '',
  ].join('\r\n');

  const { ZipArchive } = await import('archiver');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(packagePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') return;
      reject(error);
    });
    archive.pipe(output);
    archive.file(installerPath, { name: installerName });
    archive.append(instructions, { name: 'README.txt' });
    archive.append(`${installerChecksum}  ${installerName}\r\n`, { name: 'SHA256SUMS.txt' });
    void archive.finalize().catch(reject);
  });

  const packageContents = fs.readFileSync(packagePath);
  return {
    packageName,
    packagePath,
    packageSize: packageContents.length,
    packageChecksum: crypto.createHash('sha256').update(packageContents).digest('hex'),
  };
}

async function main() {
  if (process.env.KRYPTON_REQUIRE_CODE_SIGNING === 'true' &&
      !process.env.CSC_LINK && !process.env.CSC_NAME) {
    throw new Error('Code signing was required, but no CSC_LINK or CSC_NAME certificate is configured.');
  }

  const managedBrowserModule = path.join(desktopRoot, 'dist-electron/main/managed-browser.js');
  run('npm', ['run', 'build']);
  if (!fs.existsSync(managedBrowserModule)) {
    throw new Error('Managed-browser protection was not compiled; refusing to publish an incomplete installer.');
  }
  const mainBundle = fs.readFileSync(path.join(desktopRoot, 'dist-electron/main/main.js'), 'utf8');
  if (!mainBundle.includes('https://krypton-ten-theta.vercel.app/api')) {
    throw new Error('Production Vercel API endpoint was not embedded in the desktop app.');
  }

  fs.mkdirSync(buildResourcesDir, { recursive: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(downloadsDir, { recursive: true });
  createInstallerSidebar(sidebarPath);
  createWindowsIcon(iconPath);

  try {
    run('npx', [
      'electron-builder',
      '--win',
      'nsis',
      '--x64',
      '--config',
      'electron-builder.yml',
    ]);

    const installerName = `Krypton-Security-Setup-${packageJson.version}.exe`;
    const installerPath = path.join(releaseDir, installerName);
    const appBundle = path.join(releaseDir, 'win-unpacked/resources/app.asar');
    if (!fs.existsSync(installerPath) || !isWindowsExecutable(installerPath)) {
      throw new Error(`A valid Windows PE installer was not created: ${installerPath}`);
    }
    if (!fs.existsSync(appBundle)) {
      throw new Error('The packaged Windows app is missing resources/app.asar.');
    }

    const installerContents = fs.readFileSync(installerPath);
    const installerChecksum = crypto.createHash('sha256').update(installerContents).digest('hex');
    const signatureStatus = getSignatureStatus(installerPath);
    if (process.env.KRYPTON_REQUIRE_CODE_SIGNING === 'true' && signatureStatus !== 'signed') {
      throw new Error(`Code signing is required, but the installer signature status is ${signatureStatus}.`);
    }

    const packageInfo = await createWindowsPackage(installerPath, installerName, installerChecksum);
    const publishedPackagePath = path.join(downloadsDir, packageInfo.packageName);
    fs.copyFileSync(packageInfo.packagePath, publishedPackagePath);

    const manifest = {
      available: true,
      releaseStatus: signatureStatus === 'signed'
        ? 'built-signed'
        : signatureStatus === 'unverified'
          ? 'built-signature-unverified'
          : 'built-unsigned',
      version: packageJson.version,
      architecture: 'x64',
      packageName: packageInfo.packageName,
      packageDownloadUrl: `/downloads/${packageInfo.packageName}`,
      packageSizeBytes: packageInfo.packageSize,
      packageSha256Checksum: packageInfo.packageChecksum,
      installerName,
      installerType: 'nsis',
      downloadUrl: `/downloads/${packageInfo.packageName}`,
      fileSizeBytes: packageInfo.packageSize,
      sha256Checksum: packageInfo.packageChecksum,
      installerSizeBytes: installerContents.length,
      installerSha256Checksum: installerChecksum,
      signatureStatus,
      installationScope: 'per-user',
      protectionScope: 'Prompt scanning: Krypton-managed Chrome/Edge profiles only. Optional Windows USB activity monitoring is employee opt-in, metadata-only; source paths and copy completion are not reliably available.',
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(backendManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.rmSync(path.join(downloadsDir, installerName), { force: true });
    console.log(`Created the Windows installer ZIP and release metadata in ${downloadsDir}`);
    if (signatureStatus === 'unsigned') {
      console.warn('This release is unsigned; Windows SmartScreen may show a publisher warning. No Windows security settings are changed.');
    }
  } finally {
    fs.rmSync(sidebarPath, { force: true });
    fs.rmSync(iconPath, { force: true });
  }
}

main().catch((error) => {
  console.error(`[Windows Release] ${error.message}`);
  process.exitCode = 1;
});
