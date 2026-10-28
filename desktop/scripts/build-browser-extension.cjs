const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');

const desktopRoot = path.resolve(__dirname, '..');
const extensionRoot = path.join(desktopRoot, 'extension');
const stageDir = path.join(extensionRoot, '.build');
const downloadsDir = path.resolve(desktopRoot, '../public/downloads');
const zipPath = path.join(downloadsDir, 'krypton-browser-extension.zip');
const localBuild = process.argv.includes('--local');
const localOutputDir = path.join(extensionRoot, '.local-build');

async function buildExtension() {
  const { ZipArchive } = await import('archiver');
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || manifest.permissions.includes('nativeMessaging')) {
    throw new Error('The extension must use Manifest V3 and must not require native messaging.');
  }

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  const stagedManifest = localBuild
    ? {
        ...manifest,
        host_permissions: ['http://localhost:3000/*', 'http://127.0.0.1:3000/*'],
      }
    : manifest;
  fs.writeFileSync(
    path.join(stageDir, 'manifest.json'),
    `${JSON.stringify(stagedManifest, null, 2)}\n`,
  );
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
  fs.writeFileSync(
    path.join(stageDir, 'background.js'),
    localBuild
      ? background.replace(
          "const API_BASE = 'https://krypton-ten-theta.vercel.app/api/desktop/extension';",
          "const API_BASE = 'http://localhost:3000/api/desktop/extension';",
        )
      : background,
  );
  fs.copyFileSync(path.join(extensionRoot, 'popup.html'), path.join(stageDir, 'popup.html'));
  fs.copyFileSync(path.join(extensionRoot, 'popup.js'), path.join(stageDir, 'popup.js'));

  await build({
    entryPoints: [path.join(extensionRoot, 'src/content.ts')],
    outfile: path.join(stageDir, 'content.js'),
    bundle: true,
    format: 'iife',
    target: 'chrome116',
    minify: true,
    sourcemap: false,
    platform: 'browser',
  });

  if (localBuild) {
    if (!fs.readFileSync(path.join(stageDir, 'background.js'), 'utf8').includes(
      "const API_BASE = 'http://localhost:3000/api/desktop/extension';",
    )) {
      throw new Error('Could not configure the local extension API URL.');
    }
    fs.rmSync(localOutputDir, { recursive: true, force: true });
    fs.renameSync(stageDir, localOutputDir);
    console.log(`Created the local unpacked extension: ${localOutputDir}`);
    return;
  }

  fs.mkdirSync(downloadsDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') return;
      reject(error);
    });
    archive.pipe(output);
    archive.directory(stageDir, false);
    void archive.finalize().catch(reject);
  });

  const contents = fs.readFileSync(zipPath);
  fs.writeFileSync(
    path.join(downloadsDir, 'browser-extension-release.json'),
    `${JSON.stringify({
      available: true,
      version: manifest.version,
      packageName: 'krypton-browser-extension.zip',
      downloadUrl: '/downloads/krypton-browser-extension.zip',
      fileSizeBytes: contents.length,
      sha256Checksum: crypto.createHash('sha256').update(contents).digest('hex'),
      distribution: 'development-or-managed-installation',
      storePublished: false,
    }, null, 2)}\n`,
  );
  fs.rmSync(stageDir, { recursive: true, force: true });
  console.log(`Created the common extension package: ${zipPath}`);
}

buildExtension().catch((error) => {
  console.error(`[Browser Extension Build] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
