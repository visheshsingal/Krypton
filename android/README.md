# Krypton Android app

Krypton Android uses a custom, user-enabled input method (keyboard) to check text as it is typed. The app signs in to the Krypton service, activates the device, and refreshes the administrator policy and schedule. Text checks run locally on the phone; typed text and detections are not uploaded.

## Set up the keyboard

1. Install and open Krypton, then sign in with the employee account.
2. Tap **Enable Krypton keyboard** and enable it in Android's input-method settings.
3. Return to Krypton, tap **Select Krypton keyboard**, and choose it as the active keyboard.
4. Confirm the app reports that policy is active. The keyboard displays whether checks are active whenever it is open.

The keyboard compares text entered through it against common API-key, private-key, database-URL, and labeled-password patterns, plus recognizable email, phone, Aadhaar, PAN, SSN, and valid payment-card number formats. Secret and PII checks follow the corresponding administrator policy switches. When a match is found, only the matching value is removed before it remains in the field. The user can keep it blocked or choose **Allow once** if the administrator's policy permits bypassing warnings. Password-entry fields and Krypton's own sign-in fields are not scanned.

Ordinary questions are intentionally allowed. This on-device pattern detector does not understand prompt meaning or identify every confidential business detail, and is not a semantic classifier. The app's dashboard includes a synthetic test phrase to confirm that detection and the policy-based choice bar work.

Policy timing uses the administrator's schedule and server time. The app refreshes policy on sign-in and periodically while the keyboard is in use. A reboot or expired offline validation requires the app to reconnect before policy is considered active.

## Important coverage limits

This is not device-wide or tamper-proof enforcement. Android requires the user to enable and select Krypton as the keyboard. Text entered with another keyboard, pasted from the clipboard, dictated, inserted by an app, or entered into a custom editor may not be inspected. Apps can also handle submission in app-specific ways. Do not rely on this keyboard as the only control for protecting secrets.

The app sends account, device, and policy requests to the Krypton API. It does not send the text being typed or detection contents. Use synthetic values for testing, never real credentials.

## Build a local debug APK

Requirements: JDK 17+, Android SDK Platform 35, Android SDK Build-Tools 35.0.0, and Android SDK Command-line Tools. Configure `ANDROID_HOME` and `JAVA_HOME`, then run:

```sh
cd android
./gradlew assembleDebug
```

The local debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. This command does not publish or copy the APK to the website. The APK is debug-signed for development and testing only; production distribution requires protected release signing and the relevant privacy and store review.

## Manual app testing

1. Install the debug APK, open Krypton, and sign in using a test account.
2. Enable and select Krypton keyboard in Android settings.
3. Confirm the keyboard reports the administrator policy as active.
4. In a test text field, type the dashboard sample `My password is Demo-Pass-123!` or a synthetic API key such as `sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456`. Confirm the detected value is removed and the policy-appropriate block/allow choices appear.
5. Test the administrator schedule outside and inside its active window, and verify policy status changes accordingly.
6. Confirm password fields are identified as not scanned.

Use only synthetic values and test accounts.
