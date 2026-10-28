# Krypton Browser Extension

This is one shared Manifest V3 extension package. It does not contain customer credentials or a customer-specific license. On Windows, activation continues to use a single-use, ten-minute code issued by Krypton Desktop. On macOS, the browser popup accepts the user's company license and account credentials directly, without requiring the macOS desktop app. Both flows issue a revocable 30-day extension session and use the existing company seat, license, subscription, and device-limit checks.

## Build the common ZIP

From the repository root, run:

```sh
npm --prefix desktop install
npm run extension:build
```

The install is a one-time step if desktop dependencies are not already installed.
The script bundles the desktop `PromptSecurityEngine` and built-in rules into `public/downloads/krypton-browser-extension.zip`. The archive contains only the extension files and can be distributed unchanged to all customers.

Each activated employee must already hold a seat in the existing company license. Windows pairing is bound to that employee and their registered desktop device. macOS browser activation registers that browser installation as one device under the same license, so it counts against the existing per-user device limit, but does not create a separate seat.

In the Krypton Desktop app, choose Chrome or Edge and click **Prepare extension in browser**. Krypton downloads the common ZIP, verifies its SHA-256 checksum, extracts it into the current user's application-data folder, and opens that browser's extensions page. This requires a rebuilt Desktop installer containing the setup flow.

## Development or managed installation

1. Install the common ZIP in Chrome or Edge using **Load unpacked** (the browser requires this one-time approval).
2. On macOS, open the extension popup and sign in with the company license, account email, and password. On Windows, continue using Krypton Desktop to pair as before.

This free sideload method requires Developer mode and a one-time manual folder selection; browsers do not provide a supported API for a desktop app to approve or register an unpacked extension silently in a user's existing profile. It is not a consumer-friendly Chrome Web Store installation.

### Local Mac testing

From the repository root, run `npm --prefix desktop run build:extension:local`. This creates an unpacked development build in `desktop/extension/.local-build` that only connects to `http://localhost:3000`; it does not change the customer ZIP or its release metadata. Start the local Next.js app with `npm run dev`, then in Chrome or Edge open the extensions page, enable Developer mode, choose **Load unpacked**, and select that folder. Sign in through the extension popup using a test company license and account. The local API still requires a working local `.env`/database configuration. Remove the local extension from the browser when finished.

## Detection and privacy boundaries

- The extension injects only on the supported ChatGPT, Claude, Gemini, Copilot/Bing, and Perplexity host patterns in `manifest.json`.
- Prompt text is scanned locally using the same engine and company policy as the desktop scanner. Only when a submission is blocked are bounded event metadata and the hostname sent to Krypton over HTTPS; prompt text, matched values, and redacted excerpts are not sent.
- Submission interception is best-effort on supported page forms, send buttons, and Enter-to-submit. Websites can change their UI, and this cannot protect unsupported pages, browser-native routes, other browsers, or content submitted through non-page interfaces.
- The extension requires Chrome/Edge permission to run on the listed AI-site domains and access to the Krypton API. It does not use native messaging or a browser extension companion host.
- Server heartbeats run every five minutes. License, subscription, user-seat, or device revocation disables protection on the next successful heartbeat. During a network outage, the last policy may remain active for the account's configured offline grace period; remote revocation cannot be learned while offline.
- The extension runs as a user-level browser client. It is not tamper-proof against a local administrator or a user who deliberately modifies/removes the extension.

## Store publication requirements

Chrome Web Store publishing still requires a publisher account, review, final permissions/privacy disclosures, and the assigned store listing ID. Edge Add-ons publication is a separate manual submission. No store listing, approval, or managed-install deployment is created by this repository.
