const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const androidRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(androidRoot, '..');
const apkPath = path.join(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk');
const metadataPath = path.join(androidRoot, 'app/build/outputs/apk/debug/output-metadata.json');
const downloadsDir = path.join(repositoryRoot, 'public/downloads');

if (!fs.existsSync(apkPath)) {
  throw new Error(`Debug APK was not built: ${apkPath}`);
}
if (!fs.existsSync(metadataPath)) {
  throw new Error(`Android build metadata is missing: ${metadataPath}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const output = metadata.elements?.find((element) => element.outputFile === path.basename(apkPath));
if (!output?.versionName || !Number.isInteger(output.versionCode)) {
  throw new Error('Android build metadata does not contain a valid APK version.');
}

const apkName = `Krypton-Android-${output.versionName}-test.apk`;
const destination = path.join(downloadsDir, apkName);

fs.mkdirSync(downloadsDir, { recursive: true });
fs.copyFileSync(apkPath, destination);
const apk = fs.readFileSync(destination);
if (apk.length < 4 || apk[0] !== 0x50 || apk[1] !== 0x4b) {
  throw new Error('The Android build output is not a valid APK archive.');
}

fs.writeFileSync(
  path.join(downloadsDir, 'android-release.json'),
  `${JSON.stringify({
    available: true,
    version: output.versionName,
    versionCode: output.versionCode,
    releaseStatus: 'debug-test-build',
    packageName: apkName,
    downloadUrl: `/downloads/${apkName}`,
    fileSizeBytes: apk.length,
    sha256Checksum: crypto.createHash('sha256').update(apk).digest('hex'),
    signatureStatus: 'debug-keystore',
    limitations: [
      'Test build only; not signed with a production release key.',
      'Accessibility scanning checks editable text locally and may not work in every app.',
      'The app warns about detected secrets but cannot guarantee blocking submissions.',
      'Text is not stored or transmitted by this app.',
    ],
  }, null, 2)}\n`,
);

console.log(`Published Android test APK: ${destination} (${apk.length} bytes)`);
