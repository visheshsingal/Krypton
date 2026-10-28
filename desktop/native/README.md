# Windows managed-browser scope and native filtering status

## Windows desktop updates

The installed Krypton app checks `public/downloads/windows-release.json` for a newer x64 release. In-app updates download the versioned NSIS installer over HTTPS, verify its SHA-256 against the release metadata, ask for confirmation, then launch the installer and close Krypton. The same per-user NSIS installer updates the existing install directory; uninstalling first is not required, and app data is kept. The Windows ZIP remains available for first-time installs and manual updates by extracting it and running its setup file. Publish the versioned setup executable alongside the ZIP and update the release manifest when publishing a release. Unsigned releases may still show Windows SmartScreen/publisher warnings; Krypton does not bypass Windows security.

Krypton does **not** have an operating-system DNS or network filter. On Windows, the desktop app can launch installed Chrome or Edge with a separate Krypton-managed browser profile and a local DevTools Protocol connection. The existing prompt scanner inspects selected AI-site HTTPS POST request bodies locally and cancels matching requests before they are sent when policy says to block. The UI and release metadata describe this as managed-profile-only protection.

No browser extension is used or required. Ordinary Chrome/Edge profiles and other applications are not inspected; only the browser process Krypton starts with its dedicated profile and DevTools endpoint is protected.

## Existing components that can be reused

- `src/main/main.ts` owns the Electron main process, desktop activation, authenticated heartbeat, policy caching, security-event reporting, and managed-browser lifecycle.
- `src/main/managed-browser.ts` launches Chrome/Edge in a separate profile, attaches over a local DevTools Protocol socket, intercepts selected AI-site POST requests, and scans their request body locally before allowing transmission.
- `src/main/protected-browser-policy.ts` limits launch targets to supported AI providers and creates a fixed redacted incident payload.
- `src/main/store.ts` persists device identity, activation state, and the last policy returned by the server.
- `backend/src/controllers/desktopController.ts` and `app/api/desktop/heartbeat/route.ts` validate device/license state and return the company security policy.
- `backend/src/models/Device.ts` and the company device dashboard already provide device registration, heartbeat, health timestamps, and administrator revocation.
- `backend/src/models/SecurityEvent.ts`, the desktop event endpoint, and the company incidents view are reused for sanitized blocked-prompt metadata; no prompt body or detected secret is sent.
- `src/engine/scanner.ts` is a local prompt/secret scanner. It is not a DNS resolver, malicious-domain threat-intelligence engine, or system-wide browser monitor.

## Managed-browser limitations

Protection is effective only in Chrome/Edge instances launched by Krypton with the dedicated Krypton profile. Users can sign into Gmail in that browser profile; cookies/login state persist in the separate profile. The scanner does not monitor global keystrokes or clipboard contents and does not inspect ordinary browser profiles, native AI apps, or other desktop software. It inspects only HTTPS POST routes matching known AI prompt endpoints. Provider endpoint changes, WebSocket-based submissions, unsupported request encodings, and future API changes may bypass inspection; those limitations require regular Windows/provider testing.

The browser uses a separate user-data directory and an ephemeral loopback DevTools Protocol endpoint. Krypton closes its managed browser session on logout or app exit. Policy is cached locally from the existing authenticated heartbeat path; access requires a valid license and recent server validation (bounded by the license offline grace period). Block reports contain rule and risk metadata plus a fixed redacted preview, never request bodies, prompt contents, or detected secret text.

The signed-in Gmail identity is not yet bound to company-admin approval. Browser account changes remain controlled by Chrome/Edge; preventing a user from changing the Google account needs an approved, privileged browser-management policy and server-side account-binding workflow. Do not treat the browser's signed-in email as verified Krypton identity.

## Windows native system-wide filtering (not implemented)

System-wide domain filtering still requires a privileged Windows service and DNS/WFP enforcement component, trusted policy updates, explicit administrator approval, robust lifecycle/uninstall behavior, and Windows-specific testing. Browser DNS-over-HTTPS and other DNS bypass paths would also need to be handled. No Windows service, WFP provider/callout, DNS proxy, or system-wide lifecycle integration exists in this repository.

## USB storage activity monitoring (Windows, opt-in)

The desktop app offers an employee-controlled USB monitoring toggle. It is off by default and requires an active online license and an authenticated employee device. The employee can disable it from the desktop app; logout stops the watcher and attempts to revoke the server-side consent. The monitor queries Windows removable logical-drive metadata using read-only CIM queries and observes directory notifications only on those removable volumes. It does not request administrator privileges, install a driver/service, read file contents, capture keystrokes, inspect the clipboard, or watch fixed disks.

Connection/disconnection events and observed file creation/change metadata include the Windows account name, employee account, registered device, removable-drive metadata, file name/extension/size, timestamp, and destination path. File writes are reported as `destination_write_observed`, not as a verified completed copy. The unprivileged directory watcher cannot reliably determine the source path, distinguish every copy from other file writes, or guarantee that all writes will be observed; `sourcePath` is therefore stored as unavailable. Permission failures and upload failures are surfaced in the desktop monitor status. Events are uploaded immediately; there is no offline queue, so activity observed while the API is unreachable may not appear in the company dashboard.

The company dashboard exposes only the authenticated company’s events and registered-device consent state. API event records are application append-only and use a server HMAC chain per device. This is tamper-evident metadata storage, not a privileged local tamper-proof log or a Windows Security audit trail. Alert rules are metadata heuristics for sensitive-looking extensions, files of at least 100 MB, and high-volume writes; alerts do not block transfers.

## macOS requirements (not implemented)

System-wide DNS filtering requires a signed Network Extension DNS proxy (`NEDNSProxyProvider`) packaged as a separate `.appex` target, an app-group channel for the cached policy, and host-app lifecycle integration through `NEDNSProxyManager`. macOS requires the Network Extension DNS Proxy entitlement, a matching provisioning profile and signing identity, and user approval to activate the network extension. Distribution also requires notarization. Depending on deployment and macOS policy, MDM enrollment may be needed for managed activation.

The Electron app, Xcode extension target, provider, entitlement, provisioning profile, and approval flow have not been implemented. `npm run build:mac` refuses release when the provider bundle is absent, in addition to its existing signing/notarization preflight.

## Offline policy and privacy requirements

The managed browser reuses the existing locally cached company prompt policy and scanner. The existing heartbeat refreshes policy, and the block event path reports only sanitized incident metadata. The current supported web integrations are ChatGPT, Copilot, Claude, Gemini, and Perplexity in a Krypton-launched Chrome or Edge managed profile. Each provider's known HTTPS POST prompt route is checked by unit tests; provider-side endpoint changes, WebSocket-based submissions, unsupported request encodings, and future API changes can affect coverage and require Windows/provider regression testing. This does not provide cached domain feeds, malicious-domain blocking, DNS filtering, or protection when Krypton is not open.

Standalone ChatGPT and Copilot desktop clients, Microsoft 365 Copilot, and other native desktop applications are not protected. They do not expose a documented pre-submit integration that Krypton can use to inspect and block prompts reliably. Krypton does not use keyboard hooks, accessibility scraping, clipboard monitoring, or unrelated input capture. Use ChatGPT/Copilot web inside the Krypton-managed browser profile for the supported protection flow.

The Windows installer can package managed-browser protection without claiming native DNS filtering. A Windows-specific installer/runtime test is still required before asserting verified Windows behavior; macOS builds remain outside this Windows-only implementation.
