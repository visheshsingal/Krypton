# Krypton Browser Extension

This is one shared Manifest V3 extension package. It does not contain customer credentials or a customer-specific license. Activation uses a single-use, ten-minute code issued by a signed-in Krypton Desktop session, then a revocable 30-day session tied to that user's registered desktop device and existing company seat.

## Build the common ZIP

From the repository root, run:

```sh
npm --prefix desktop install
npm run extension:build
```

The install is a one-time step if desktop dependencies are not already installed.
The script bundles the desktop `PromptSecurityEngine` and built-in rules into `public/downloads/krypton-browser-extension.zip`. The archive contains only the extension files and can be distributed unchanged to all customers.

Each activated employee must already hold a seat in the existing company license. Pairing is bound to that employee and their registered desktop device; the extension does not create or consume a separate license seat.

## Development or managed installation

1. Download and extract `krypton-browser-extension.zip`.
2. In Chrome open `chrome://extensions`; in Edge open `edge://extensions`.
3. Enable Developer mode and select **Load unpacked**, then choose the extracted extension directory.
4. Sign in and activate Krypton Desktop, select the same browser, and generate a one-time activation code.
5. Open the extension popup and enter that code before it expires.

The ZIP is for development/testing or managed deployment. It is not a consumer-friendly Chrome Web Store installation.

## Detection and privacy boundaries

- The extension injects only on the supported ChatGPT, Claude, Gemini, Copilot/Bing, and Perplexity host patterns in `manifest.json`.
- Prompt text is scanned locally using the same engine and company policy as the desktop scanner. Only when a submission is blocked are bounded event metadata and the hostname sent to Krypton over HTTPS; prompt text, matched values, and redacted excerpts are not sent.
- Submission interception is best-effort on supported page forms, send buttons, and Enter-to-submit. Websites can change their UI, and this cannot protect unsupported pages, browser-native routes, other browsers, or content submitted through non-page interfaces.
- The extension requires Chrome/Edge permission to run on the listed AI-site domains and access to the Krypton API. It does not use native messaging or a browser extension companion host.
- Server heartbeats run every five minutes. License, subscription, user-seat, or device revocation disables protection on the next successful heartbeat. During a network outage, the last policy may remain active for the account's configured offline grace period; remote revocation cannot be learned while offline.
- The extension runs as a user-level browser client. It is not tamper-proof against a local administrator or a user who deliberately modifies/removes the extension.

## Store publication requirements

Chrome Web Store publishing still requires a publisher account, review, final permissions/privacy disclosures, and the assigned store listing ID. Edge Add-ons publication is a separate manual submission. No store listing, approval, or managed-install deployment is created by this repository.
