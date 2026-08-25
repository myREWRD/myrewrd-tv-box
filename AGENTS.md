# AGENTS.md — myREWRD TV Box (`myrewrd-tv-box`)

> **Read before editing or releasing.** This public repository builds the unattended Windows Electron appliance installed at venues. A selected push to `main` can publish a GitHub Release consumed by deployed boxes.

## Platform source of truth

Canonical cross-platform documentation lives in `myREWRD/ssdt-dashboard/docs/`. Begin with `myREWRD/ssdt-dashboard/AGENTS.md` and `myREWRD/ssdt-dashboard/docs/README.md`, then read `docs/product/TV_AND_LIVE_GAMES.md`, `docs/architecture/DATA_FLOW.md`, `docs/operations/DEPLOYMENT.md`, `docs/security/SECURITY_AUDIT_2026-08-25.md`, and the Knowledge Pack before changing device APIs, commands, tokens, TV routes, or release behavior.

Use this evidence order: **verified live state → current config on `origin/main` → current source on `origin/main` → Git history → repository documentation → AI memory, previous chats, old summaries, or unstaged local context**. Never infer a command, endpoint, venue token format, or updater contract from this README alone. When evidence conflicts, identify it, determine verified current/intended behavior, and update durable GitHub knowledge in the same pull request when appropriate.

## Mandatory Pre-Task Workflow

Before implementation, identify affected repositories/services; read this guide and relevant dashboard canonical docs; fetch and fast-forward current `origin/main`; inspect current client/API/updater implementation and Git history when rationale is unclear; identify device/venue scope, public-display privacy, older AppData/payload compatibility, Windows/updater/release, hardware/unattended, dashboard, and knowledge impact; and define validation, recovery, and review. Do not publish or download-run untrusted artifacts during investigation.

## Mandatory Knowledge Maintenance

Every task must assess durable impact on pairing, commands, device/venue authorization, TV modes, public payloads, updater/release contracts, AppData/config formats, hardware, and dashboard APIs. When affected, update repository and dashboard documentation/generated references in the **same pull request**. A task is incomplete when code changes but durable knowledge remains stale; important findings must not remain only in chat. This applies to every agent and human developer.

## Architecture

`src/main.js` owns Electron windows/views, local AppData configuration, PIN pairing, five-second HTTP command polling, navigation, streaming sessions, and update behavior. The client does not use a WebSocket control channel. The dashboard API is the authorization and command boundary; the web TV Board renders venue content.

## Non-negotiable rules

1. **Keep this repository public.** The installer/updater performs unauthenticated release downloads.
2. Never push directly to `main`; use a branch and pull request.
3. Treat selected `main` changes as release-coupled because `build-windows.yml` can publish a portable executable.
4. Never commit or log TV tokens, PINs, Wi-Fi passwords, streaming credentials, cookies, or provider sessions.
5. Never accept arbitrary navigation targets; validate/allowlist HTTPS service and myREWRD URLs.
6. Never weaken device/venue command scoping to fix connectivity.
7. Preserve unattended operation: venues should not need keyboard/mouse or local software actions after installation.
8. Maintain compatibility with older dashboard command payloads and deployed configuration formats.
9. Do not describe a local/macOS/Linux build as production verification; production is Windows portable x64.
10. Do not publish a release without explicit approval and end-to-end updater validation.

## Pairing and command safety

The box generates a six-digit pairing PIN and polls until the backend returns its device/venue configuration. PINs must expire and be single-purpose. Persist only the issued configuration in AppData. A box must never adopt another venue’s configuration based on a caller-supplied venue ID alone.

HTTP polling should be resilient to offline periods, timeouts, malformed JSON, duplicate commands, and server errors without creating a tight retry loop. Commands should be idempotent or acknowledged so stale actions are not replayed indefinitely.

## Public-display privacy

TV content is visible to anyone at the venue. Never render phone numbers, email addresses, Auth user IDs, ticket/payment data, private messages, internal notes, Wi-Fi credentials, game answers, private submissions, or service tokens. Live Games must use sanitized `game_display_state` only.

## Updater safety

The updater depends on public GitHub Releases. Validate response success, content type/size, expected filename/version, and preferably a release checksum/signature before replacement. Preserve the current protection against implausibly small downloads. Use an atomic/recoverable replacement and avoid restart loops.

Changing repository visibility is prohibited. Branch protection is absent at the 2026-08-25 audit; procedure must prevent direct release-affecting pushes.

## Development and validation

```bash
npm install
npm start
npm run build:win-portable
```

There is no committed lockfile and no automated test/lint/type-check script at the audit date. Dependency installation is therefore not reproducible; add a lockfile in a dedicated PR. The 2026-08-25 temporary-lock production audit reported no vulnerabilities, but future scans must use the resolved release lock.

Manual Windows validation must cover clean pairing, saved configuration, every command, Regular/Stream/Game Day/Live Games modes, wrong token/device, offline/reconnect, streaming session persistence, power-loss restart, previous-version update, valid/invalid release download, and uninstall/reinstall recovery.

## Mandatory Post-Task Workflow

Before completion, confirm the diff is limited to approved scope; pairing, device/venue/invalid-token cases, commands/modes, privacy, offline/reconnect/restart, older config/payloads, Windows artifact, actual updater path, release consequence, and recovery were checked where relevant; no secret or unauthorized release occurred; docs/generated references were updated and verified; and the PR states code, knowledge, release, and device-recovery impact.

Authentication/authorization, device tokens, dashboard APIs, updater/release workflows, Windows artifacts, navigation/privacy, secrets, deployment infrastructure, or destructive behavior require human review or a **second independent AI review** of the actual diff/current code plus human approval before production.

## Pull request and release

Fetch and fast-forward, branch, match current repository author convention, and open a PR. Include dashboard/API compatibility, configuration migration, public-display privacy, Windows test evidence, updater/release effect, and recovery.

After an approved release, download through the actual public updater/installer URL and verify a Windows binary, then test update and unattended restart on representative hardware.

## Documentation maintenance

Update this repository and the dashboard TV/operations documentation for command, pairing, token, mode, release, updater, or hardware assumptions. Record reasoning and rejected alternatives in the dashboard Knowledge Pack. Run relevant Knowledge Pack/documentation checks before completion.
