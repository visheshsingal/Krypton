# Krypton Android app

The Android app is a local setup screen for optional, user-enabled text checks across apps. It does not require an account, enroll the phone, connect to the Krypton API, or report detections to the dashboard.

After the user enables **Krypton local text protection** under Android Settings → Accessibility, the service checks editable text fields for common API keys, private keys, and password-like strings. Password-entry fields are skipped. Scanning is on-device; the app does not save or transmit text or detections. It does not capture screenshots or inspect non-editable screen content.

This is best-effort warning, not guaranteed blocking: apps can hide field contents from Accessibility or submit before a warning is shown. Accessibility must be enabled and can be disabled by the user in Android Settings at any time. The app does not attempt to enable the service itself.

## Build and publish the installable test APK

Requirements: JDK 17+, Android SDK Platform 35, Android SDK Build-Tools 35.0.0, and Android SDK Command-line Tools. The first build downloads the Gradle wrapper distribution and Android Gradle Plugin.

```sh
cd android
./build-debug-apk.sh
```

The command builds a debug-signed, versioned APK in `public/downloads/` and also updates the stable download URL `/downloads/Krypton-Android-0.1.0-test.apk` used by the website button. Its checksum and `debug-test-build` status are recorded in `public/downloads/android-release.json`. Deploy the website to publish the APK at the existing download URL. Android may ask the user to allow installation from the browser or file manager that opened the APK.

This debug APK is for testing only. Do not distribute it as a production release; production publishing needs a protected release-signing key and additional Play Store/privacy review.

## Manual app testing

1. Install the APK and open Krypton.
2. Tap **Open Accessibility Settings** and explicitly enable **Krypton local text protection**.
3. Return to Krypton and confirm the enabled status is shown.
4. In a test text field in another app, type a synthetic credential-looking string and confirm a local warning appears.
5. Disable the service in Android Accessibility settings and confirm Krypton reports protection as off.

Do not use real credentials or production secrets for testing.
