# myREWRD TV Box setup and wake recovery

Hardware target: GMKtec G3S Windows mini PC. This supersedes the old manual Chrome startup instructions; the supported client is the Electron appliance.

## Install once

1. Connect power, HDMI, temporary keyboard/mouse, and setup Wi-Fi. Complete Windows setup with a dedicated local `myrewrd` appliance account, not a personal Microsoft account.
2. In the dashboard, use Platform → TV Devices → Provision Device. Select the venue/device and optionally destination Wi-Fi, then download the individualized setup BAT. Treat this file as a credential because it contains the issued TV token.
3. On the appliance, run that BAT as administrator from the local `myrewrd` account. It verifies the public executable, saves pairing, creates startup, and restarts. Successful setup deletes its credential-bearing BAT; securely remove any transferred copies too.
4. Confirm the board opens and Platform → TV Devices reports Online. Complete the checklist below before removing keyboard/mouse.

The existing provisioning workflow uses a dedicated passwordless local account and boot auto-login. It is not a Windows security boundary and must not contain personal/admin dashboard sessions. This change does not add stored Windows passwords or auto-submit web credentials. Conversion to a least-privilege managed kiosk is separate work.

## Repair an already-installed box

Use `scripts/Repair-TVBoxPower.ps1` from this repository on the dedicated appliance, as administrator under the local `myrewrd` account. It configures both AC and battery power/sleep buttons to Do Nothing and disables the active plan's password-on-resume setting. It does not alter device pairing, passwords, autologon, or the installed executable. Do not run it on a personal/shared PC. Existing firmware/organization policies may override Windows settings: failed commands or a remaining wake sign-in screen mean the box must not be shipped until the responsible Windows policy is resolved.

The power repair addresses the Windows sign-in screen even on 1.0.3. Version 1.0.4 contains app wake/pairing recovery, but its updater has a confirmed Windows process-lifetime bug. Re-running old setup alone cannot add the corrected updater. Never overwrite a verified download hash with an unverified candidate hash.

## One-time attended updater repair

This is an acceptance procedure for an approved repair artifact, not authorization to install the current unpublished candidate. Legacy versions through 1.0.4 must not receive another automatic update through their broken updater. The companion API blocks those offers. Do the first repair on the owner's myREWRD test box before scheduling any venue repair; do not use the experimental self-detaching bootstrap for an unattended fleet rollout.

1. Keep the existing AppData/profile and Startup BAT. Copy the approved, checksum-verified Windows repair executable into the existing `C:\Users\myrewrd\myREWRD-TV-Box` folder under its new versioned filename, retaining the old executable. Do not rerun provisioning, unpair, clear storage, or copy another device's configuration.
2. On the dedicated local `myrewrd` account, close the current TV app normally with Alt+F4. Launch the new executable locally, outside the old updater. Confirm the correct paired board appears without a login. If it does not, close the candidate and relaunch the retained old executable; leave Startup unchanged.
3. Only after that confirmation, back up the existing `myREWRD-TV-Box.bat` in the current user's Startup folder and change its executable path to the new versioned file. Keep its `@echo off` / `start "" "<full executable path>"` structure. Do not put tokens or credentials into the BAT.
4. Run `scripts/Repair-TVBoxPower.ps1` as administrator on that dedicated local appliance account. This independently addresses Windows' sign-in-on-wake policy; an Electron update cannot unlock Windows.
5. Reboot, verify the new version's heartbeat and visible paired board, then complete every physical sleep/power/offline acceptance check below. Failure means restore the previous Startup path and executable, retain the profile, and keep rollout paused.
6. Subsequent approved updates from 1.0.5 or later can use the supervised update path with a reviewed release checksum. Verify a real successful update and a controlled failed replacement on the test box before fleet use. Never infer display health solely from a stored Online status.

## Acceptance before delivery

- Restart and cold power-cycle: without touching sign-in, the correct venue board opens full-screen and the device becomes Online.
- Briefly press the physical power button while running: the board remains visible. A held button can still force shutdown; BIOS power-loss recovery is hardware-specific.
- Deliberately select Windows Sleep, then wake: no Windows Sign in click/password/PIN, no myREWRD login, correct board/mode, and Online heartbeat. Test several cycles and one longer sleep.
- Wake with Wi-Fi unavailable, then restore Wi-Fi: the board retries automatically without new pairing. Repeat while the initial board load fails.
- Check Regular, Stream, Game Day, and Live Game takeover/return. Existing provider cookies should survive relaunch; provider-mandated login expiry remains outside myREWRD control.
- Complete fallback PIN pairing and restart: the pairing remains saved. Verify unpair/revocation does not regain access on wake.
- On an isolated test device, verify renderer recovery and the previous-version updater path using the actual public approved artifact. Confirm version and pairing after restart.

Record Windows edition/build, hardware/BIOS, installed app version, date, and results without tokens, Wi-Fi passwords, or screenshots of credentials. Automated mocked lifecycle tests supplement but do not replace this checklist.

## Troubleshooting and recovery

| Symptom | Action |
|---|---|
| Windows Sign in after wake | Apply the dedicated power repair and inspect overriding local/domain power policies. Electron cannot unlock Windows. |
| Pairing appears after relaunch | Verify the same Windows profile/AppData is in use; install the pairing-persistence fix. Never copy another venue's config. |
| Invalid token screen | An authorized operator must inspect/re-pair the device; do not bypass token validation. |
| Board blank while offline | Restore networking and allow the bounded retry; verify server availability. |
| Streaming provider login | Use authorized provider login; no password automation is supplied. |

For rollback, restore the prior approved executable while retaining AppData. Power changes are independent: use Windows Power Options to restore the intended button actions and require sign-in setting if the PC is repurposed. Do not reset credentials or clear the persistent browser profile to fix wake behavior.
