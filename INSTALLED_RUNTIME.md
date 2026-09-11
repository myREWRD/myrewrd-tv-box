# Permanent Windows runtime and presentation firewall (2.0.0)

[IMPLEMENTED 2026-09-11; physical migration acceptance pending] This supersedes the version-specific portable firewall guidance for 1.0.8. Existing portable releases remain on the legacy offer; they cannot silently elevate or install a ZIP. One administrator migration is required on each existing appliance. After migration, ordinary updates run without elevation and retain the firewall program paths.

## Installation and repair

Use Platform → TV Devices → Download permanent firewall upgrade on an existing paired box. Transfer the BAT to the dedicated local `myrewrd` Windows account and run as administrator once. It verifies the public setup script checksum; that script verifies the runtime ZIP checksum, installs the runtime, preserves AppData/configuration/DPAPI receiver key, changes Startup, and reboots. It does not enroll an unapproved receiver or clear pairing. Do not run full provisioning on an existing box. The migration button can repair the four rules on an already migrated box without changing its current startup slot.

New boxes use the current individualized Download Setup Script. The bootstrap installs the runtime and firewall before saving the issued device configuration and restarting. Interrupted first provisioning can resume; a separate completion marker prevents re-provisioning an installed appliance. An existing migration writes this completion marker too. A restart failure requires a manual restart, not re-provisioning.

The fixed executable paths beneath `%USERPROFILE%\myREWRD-TV-Box` are `runtime-a\myREWRD TV Box.exe` and `runtime-b\myREWRD TV Box.exe`. Setup creates exact-program inbound TCP and UDP Allow rules for both, on all Windows profiles, restricted to LocalSubnet with edge traversal blocked. Windows Firewall remains enabled. Only these named rules are replaced during repair; unrelated policy is retained. Domain-enforced firewall policy can still override local rules and needs administrator resolution.

## Updates and recovery

Version 2.x is a ZIP, not a self-extracting portable executable. The active process path determines the inactive slot, independent of version parity or skipped releases. Staging verifies SHA256, ZIP entry paths/duplicates/symlinks/size bounds, embedded version/layout, executable and app resources. Reparse points and busy inactive files abort before replacement. PowerShell helpers are unpacked alongside app.asar, because external PowerShell cannot read Electron's virtual archive paths.

Only the inactive runtime is replaced. The native supervisor verifies process identity, executable hashes, and ready/active handshakes before committing Startup. Failed launch or supervisor termination retains/restores the previous startup and runtime; failure records stop automatic replay. Abandoned pre-handoff staging directories are validated and cleaned on retry, and staging errors are cleaned immediately. The main process serializes attempts and waits five minutes after preparation failure. AppData is never replaced.

Installed clients consume `tv_box_installed_version` from the platform venue's app_settings. Legacy `tv_box_latest_version` and `tv_box_demo_presentation_version` stay on 1.0.8 EXE. Never put a ZIP into either legacy setting. The installed offer requires a matching device/venue and an exact public release URL plus SHA256. Do not reuse an already published version with different bytes.

A fixed portable extraction folder was rejected: portable launcher cleanup can race a replacement or orphan process and delete the running app. No privileged remote-execution service was introduced. Stable installed directories avoid that cleanup behavior and preserve exact firewall rules.

## Validation and release gates

Run Windows `node scripts/verify-installed-update.cjs`, `powershell -File scripts/verify-runtime-extraction.ps1`, and the presentation/enrollment/wake suites. Verify A→B and B→A success, launch/no-ready/no-active failure, diagnostics failure, and supervisor-kill watchdog rollback. Download the actual released ZIP and setup script, verify their hashes and embedded version, and confirm unpacked PowerShell helpers before pinning the dashboard installer. Independent review is required.

Physical acceptance remains necessary on the owner's box: migrate once, confirm correct paired board/version, present with no firewall prompt, stop sharing/leave page and observe automatic board fallback, reboot, then validate a later update using the other slot. A heartbeat alone is not display or firewall acceptance. Retain the previous portable executable and saved Startup backup for attended migration recovery; do not delete AppData or re-pair to recover.

Presentation remains platform-admin controlled and requires physical-code receiver approval. It is video-only on the same routable local network (Wi-Fi or Ethernet). Client isolation may prevent connections. No TURN relay or off-site presenting is enabled in this rollout. A lost presentation returns the regular board; the TV artist layout is unchanged.
