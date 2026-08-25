# CLAUDE.md — myREWRD TV Box

This file is **not a separate knowledge base**. Read [`AGENTS.md`](AGENTS.md) in full. Use `myREWRD/ssdt-dashboard/docs/README.md` as the canonical cross-platform documentation index.

## Essential rules

1. Keep this repository public; deployed installers/updaters require unauthenticated release downloads.
2. Complete the mandatory pre-task workflow in `AGENTS.md`; fetch and fast-forward `origin/main`, then use a branch and pull request.
3. Apply the approved evidence order: verified live state → current config/source → Git history → repository documentation → AI memory/old chats/local unstaged context.
4. Selected `main` pushes can publish a Windows release; obtain explicit release approval.
5. The current control model is five-second HTTP polling, not WebSockets.
6. Never expose TV tokens, pairing PINs, Wi-Fi data, streaming sessions, or credentials.
7. Enforce device/venue scope; validate navigation/command payloads; exclude private data and game answers from public TV output.
8. Preserve unattended operation and backward-compatible AppData/config/command behavior.
9. Test the Windows portable artifact, clean pairing, commands/modes, invalid scope, offline recovery, and actual public updater path.
10. Update repository and dashboard knowledge/generated references in the same PR when pairing, commands, display modes, release, updater, or hardware assumptions change.
11. Require human review or a second independent AI review plus human approval for high-risk work defined in `AGENTS.md`.
12. Complete the mandatory post-task workflow and state code, knowledge, Windows/release, and device-recovery impact in the PR.

No branch protection, lockfile, or automated test suite existed at the 2026-08-25 audit. Procedure and explicit Windows regression evidence are mandatory.
