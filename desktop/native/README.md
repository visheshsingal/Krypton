# Windows managed-browser scope and native filtering status

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

## macOS requirements (not implemented)

System-wide DNS filtering requires a signed Network Extension DNS proxy (`NEDNSProxyProvider`) packaged as a separate `.appex` target, an app-group channel for the cached policy, and host-app lifecycle integration through `NEDNSProxyManager`. macOS requires the Network Extension DNS Proxy entitlement, a matching provisioning profile and signing identity, and user approval to activate the network extension. Distribution also requires notarization. Depending on deployment and macOS policy, MDM enrollment may be needed for managed activation.

The Electron app, Xcode extension target, provider, entitlement, provisioning profile, and approval flow have not been implemented. `npm run build:mac` refuses release when the provider bundle is absent, in addition to its existing signing/notarization preflight.

## Offline policy and privacy requirements

The managed browser reuses the existing locally cached company prompt policy and scanner. The existing heartbeat refreshes policy, and the block event path reports only sanitized incident metadata. This does not provide cached domain feeds, malicious-domain blocking, DNS filtering, or protection when Krypton is not open.

The Windows installer can package managed-browser protection without claiming native DNS filtering. A Windows-specific installer/runtime test is still required before asserting verified Windows behavior; macOS builds remain outside this Windows-only implementation.
