const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const androidRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(androidRoot, '..');
const apkPath = path.join(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk');
const downloadsDir = path.join(repositoryRoot, 'public/downloads');
const apkName = 'Krypton-Android-0.1.0-test.apk';
const destination = path.join(downloadsDir, apkName);

if (!fs.existsSync(apkPath)) {
  throw new Error(`Debug APK was not built: ${apkPath}`);
}

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
    version: '0.1.0',
    releaseStatus: 'debug-test-build',
    packageName: apkName,
    downloadUrl: `/downloads/${apkName}`,
    fileSizeBytes: apk.length,
    sha256Checksum: crypto.createHash('sha256').update(apk).digest('hex'),
    signatureStatus: 'debug-keystore',
    limitations: [
      'Test build only; not signed with a production release key.',
      'AI prompt scanning is best-effort inside Krypton Secure Browser only.',
      'Other Android apps, including native AI apps, are not monitored.',
    ],
  }, null, 2)}\n`,
);

console.log(`Published Android test APK: ${destination} (${apk.length} bytes)`);
