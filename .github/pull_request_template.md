## Outcome

<!-- Describe the venue/operator outcome and what remains unchanged. -->

## Scope and compatibility

| Item | Detail |
|---|---|
| Pairing/configuration/AppData | |
| Command/API contract | |
| TV/display/navigation mode | |
| Updater/release behavior | |
| Older deployed-client compatibility | |
| Dashboard/venue-app dependency | |

## Security and privacy

- [ ] Repository remains public
- [ ] Device/venue/token authorization is preserved
- [ ] Pairing PIN, TV token, Wi-Fi, cookies, and streaming credentials are not logged or committed
- [ ] Navigation targets and command payloads are validated
- [ ] Public TV output excludes private identifiers, messages, payment data, credentials, and game answers
- [ ] Duplicate/stale command replay is handled safely

## Windows validation

| Check | Result/evidence |
|---|---|
| Clean PIN pairing | |
| Existing AppData/config migration | |
| Every remote command and display mode | |
| Offline/reconnect and power restart | |
| Wrong token/device/venue | |
| `npm run build:win-portable` | |
| Update from previous release | |
| Actual public download is a Windows binary | |
| Invalid/small download is rejected | |
| Not run and resulting risk | |

## Release and rollback

- Does this `main` change trigger/publish a release?
- Explicit release approval obtained?
- Artifact/version/release target:
- Rollback or device-recovery plan:

## Documentation

- [ ] README/`AGENTS.md` remain accurate
- [ ] Dashboard TV/operations/Knowledge Pack updated for material changes
- [ ] Reasoning and rejected alternatives recorded
