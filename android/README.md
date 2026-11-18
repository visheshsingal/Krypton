# Krypton Android test app

This is a native Android test app for the existing Krypton platform. It uses employee/admin accounts already created in the company dashboard; employees need sign-in enabled by an administrator. Sign-in enrolls the phone as an Android device, applies the company security policy, and reports device heartbeats. License usage is based on active paired devices per employee and rounds up in pairs: 0 devices use 0 licenses, 1–2 use 1, 3–4 use 2, and so on. Administrators can see devices under the **Android devices** dashboard tab and revoke them using the existing device action.

The initial test release provides a Krypton in-app browser for ChatGPT, Claude, Gemini, Copilot, and Perplexity. Prompt scanning runs locally and applies the downloaded company policy and custom regex rules to supported page submissions. This is best-effort protection only: website changes, browser/WebView behavior, unsupported submission paths, or native AI apps can bypass it. The app does not monitor other Android apps and does not request Accessibility, screen-capture, VPN, or device-admin permissions. The follow-up native-app protection work is intentionally not part of this test APK.

## Build and publish the installable test APK

Requirements: JDK 17+, Android SDK Platform 35, Android SDK Build-Tools 35.0.0, and Android SDK Command-line Tools. The first build downloads the Gradle wrapper distribution and Android Gradle Plugin.

```sh
cd android
./build-debug-apk.sh
```

The command builds a debug-signed APK and copies it to `public/downloads/Krypton-Android-0.1.0-test.apk`, with its checksum and `debug-test-build` status in `public/downloads/android-release.json`. Once the website is deployed with those files, the home/download page shows **Download Android APK**. Android may ask the user to allow installation from the browser or file manager that opened the APK.

This debug APK is for testing only. Do not distribute it as a production release; production publishing needs a protected release-signing key and additional Play Store/privacy review.

## API configuration

The default API endpoint is the production Krypton API. To build against another environment:

```sh
KRYPTON_API_BASE_URL=https://your-test-host.example/api ./build-debug-apk.sh
```

## Manual app testing

1. Create/invite an employee account in the company dashboard and enable sign-in.
2. Install the test APK and sign in with that employee's email and password.
3. Use the Krypton browser buttons to open a supported AI website and sign in there.
4. Submit a harmless test prompt, then test a synthetic credential-looking string. Confirm the local warning/block and check **Dashboard → Android devices** and **Activity**.
5. Revoke the phone from the Android devices tab; the app should stop protecting it after the next heartbeat.

Do not use real credentials or production secrets for testing.
