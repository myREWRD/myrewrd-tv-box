# CLAUDE.md — myREWRD TV Box

Read [`AGENTS.md`](AGENTS.md) in full. Cross-platform TV and operations documentation lives in `myREWRD/ssdt-dashboard/docs/`.

## Essential rules

1. Keep this repository public; deployed installers/updaters require unauthenticated release downloads.
2. Fetch and fast-forward `main`; use a branch and pull request; never push directly to `main`.
3. Selected `main` pushes can publish a Windows release; obtain explicit release approval.
4. The current control model is five-second HTTP polling, not WebSockets.
5. Never expose TV tokens, pairing PINs, Wi-Fi data, streaming sessions, or credentials.
6. Enforce device/venue scope and validate navigation/command payloads.
7. Public TV payloads must exclude private identifiers, messages, payment data, credentials, and game answers.
8. Preserve unattended operation and backwards-compatible AppData/config/command behavior.
9. Test the Windows portable artifact, clean pairing, all commands, offline recovery, and actual public updater path.
10. Update the dashboard Knowledge Pack when pairing, commands, display modes, release, updater, or hardware assumptions change.

No branch protection, lockfile, or automated test suite existed at the 2026-08-25 audit. Procedure and explicit Windows regression evidence are mandatory.
