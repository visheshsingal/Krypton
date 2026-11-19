# Krypton iOS keyboard prototype

This is a native iOS app plus a custom keyboard extension. The keyboard scans the text it is about to insert on-device and refuses to insert a character when the surrounding input matches one of its bundled secret patterns. It does not save or transmit typed text or detections.

The keyboard does **not** request Open Access / Full Access, network access, contacts, notifications, or other user permissions. The user must still add and select the keyboard in iOS Settings; iOS does not allow an app to enable or force-select a keyboard. It can only check text entered through Krypton Keyboard. It cannot verify when iOS changes keyboards, inspect other apps' screens, or guarantee that a host app has not already submitted content.

## Open and run

1. Open `Krypton.xcodeproj` in Xcode on a Mac.
2. Select the `Krypton` app scheme and a simulator or signed iPhone.
3. Configure a unique Apple Developer Team and bundle identifiers.
4. Build and install the app. In iPhone Settings, go to **General → Keyboard → Keyboards → Add New Keyboard → Krypton Keyboard**.
5. Leave **Allow Full Access** off. Select Krypton using the globe key while typing.

An installable IPA is not included: iOS apps must be built and signed with an Apple provisioning profile, then distributed through a supported method such as TestFlight, the App Store, or eligible managed-device distribution. The website download is the Xcode project source ZIP, not an IPA.

The prototype has no account pairing or server connection, so keyboard changes are not reported to an administrator. iOS does not expose authoritative keyboard-switch status to the containing app. Admin reporting would require a separately designed, disclosed account-pairing and network-sync flow; Full Access is intentionally not requested.
