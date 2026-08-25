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

## Knowledge Impact

- [ ] I checked whether this change affects durable platform knowledge.
- [ ] **No documentation update is required** because behavior/contracts did not change.
- [ ] **Documentation was updated** in this PR.
- [ ] Generated knowledge/reference files were refreshed where required.
- [ ] Relevant architecture/product/database/infrastructure/operations docs were reviewed.
- [ ] Cross-repository impact was considered.

Choose exactly one of the two bold documentation paths above. Explain the decision:

## Regression Impact

- [ ] Authentication reviewed if relevant
- [ ] Authorization/roles reviewed if relevant
- [ ] Multi-venue isolation reviewed if relevant
- [ ] API compatibility reviewed if relevant
- [ ] Database/RPC/RLS impact reviewed if relevant
- [ ] Mobile runtime/native/OTA impact reviewed if relevant
- [ ] Deployment/release impact reviewed if relevant
- [ ] Installed-client compatibility reviewed if relevant
- [ ] Required independent/human review is identified

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
