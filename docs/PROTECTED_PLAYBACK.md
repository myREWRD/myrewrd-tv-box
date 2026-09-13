# Game Day protected playback — 2026-09-13

[VERIFIED 2026-09-13 — signing supersession] The owner completed free EVS signup using colin@myrewrd.com. The reviewed runtime at source commit `10383a82e7cb400ad34b2b831c75788f1426e7d6` has a verified streaming VMP signature. Signed ZIP SHA256 `e06722a950deab4f20adb7f5412a2b052400aa9539e8c9cc8f265fa84d515f6a` (153212486 bytes) passed actual Windows package/installer/staging validation and an unauthenticated public-download hash check. It is published as the versioned 2.1.0 asset under the existing latest release; no fleet offer was promoted. Both Windows CI workflows passed. Dashboard PR #1988 supplies an exact-device, exact-digest, expiring test offer. Physical installation and actual YouTube TV playback remain acceptance gates. This supersedes the account/signing/publication status below; the source remains a candidate and CI credentials/version approval are not configured by signup.

Status: development candidate, not released. Owner reports the same YouTube TV NFL stream plays in Chrome on the TV computer but fails in TV Box with “video format is not supported”. This isolates the embedded player as the likely cause; it is not a captured provider error diagnosis.

## Change

Version 2.1.0 replaces stock Electron 30 with official CastLabs ECS 44.1.0+wvcus. The previous PlatformEncryptedDolbyVision flag and plugins option did not install Widevine. The official ECS component service installs Widevine from Google at runtime; the app does not bundle, copy, decrypt or proxy broadcast media. Existing AppData, provider session and command formats remain unchanged.

Game Day retains the 94% provider / 6% sponsor layout. It shows a local preparation page until the Widevine component is ready, with a 30-second wait limit and 60-second retry. The board and remote command polling remain usable while preparation is pending. Mode change, Live Games takeover, unpair and shutdown invalidate pending navigation. Refresh retains the currently selected provider URL. A recovered initialization clears failed status to connecting; component readiness and page loading are not proof of video playback.

## Windows build and signing

Use Node 24 on Windows x64. Install dependencies, then `npm run build:win-installed`. The explicit build script packages the directory (including any Authenticode signing), invokes `castlabs_evs.vmp --no-ask sign-pkg` and `verify-pkg`, then creates the ZIP. This order is intentional: electron-builder 24 skips its afterSign hook when Authenticode signing did not occur. Windows VMP signing must follow Authenticode and precede ZIP creation.

Install `castlabs-evs==1.3.2` in the build environment. `TV_DRM_PYTHON` optionally selects a Python executable. EVS reads its own account/cache or `EVS_ACCOUNT_NAME` and `EVS_PASSWD`; never put these values in command arguments, source, artifacts or logs. The owner has no existing EVS account as of this investigation. Owner account registration/verification and secure CI secret configuration remain required. Account signup is not performed by this change.

PR builds explicitly set `TV_DRM_DEVELOPMENT_BUILD=1`; their runtime-release.json says `development-only`. These are not signed YouTube TV acceptance builds. Production builds default to required EVS signing, record `production-vmp`, and fail on signing/verification errors. The main release workflow additionally requires `TV_DRM_PLAYBACK_APPROVED_VERSION` equal to the package version; set it only after signed provider playback and update acceptance. No release, fleet version or device setting has been changed.

## Acceptance and recovery

[VERIFIED INSTALLED 2026-09-13 23:48 UTC] Signed 2.1.0 is running on the owner-authorized myREWRD test box and its temporary update offer was removed (private audit 691). Automatic handoff was blocked by the old TV process itself holding inactive ASAR files; normal Electron testing reproduced patched-fs archive caching. Attended recovery closed the app, preserved profile/startup/marker and both prior runtimes, installed the exact verified ZIP into runtime-a, and switched startup atomically under the same Windows account. Game Day initializes Widevine, navigates to YouTube TV and retains its sponsor strip. YouTube TV requires a fresh account sign-in; subscribed-video playback is NOT yet verified. A separate 2.1.1 updater candidate uses original-fs and explicit physical supervisor paths; it does not replace the immutable signed 2.1.0 ZIP.

[VERIFIED DELIVERY STATUS 2026-09-13 23:34 UTC] Dashboard PR #1988 production is READY and its scoped offer is active until September 14 01:27:30 UTC (private audit 690). The owner-approved live API diagnostic returned the exact signed 2.1.0 release, but subsequent device polls still report 2.0.1. Remote Desktop connection is required to inspect the local updater; installation and actual playback are unverified. No fleet offer changed.

Local evidence on 2026-09-13: protected-playback and wake-recovery behavioral tests passed, as did sponsor/Live Games/presentation regressions. Real Windows ECS tests passed first-install Widevine readiness and sandboxed H.264/AAC MediaKeys, including a view created before component initialization. The development ZIP (SHA256 `0c8063d89fb229ef7d66d755740bb774b728b61d9c394768053374c99cc86381`) passed actual installer syntax/hash, safe extraction, unpacked helpers and packaged Electron A/B staging. Native supervisor success, reverse-slot, busy-runtime denial, exit/no-ready/no-active/diagnostic-failure/watchdog rollback and interrupted-download retry tests passed. Independent review found no remaining actionable defects after refresh and status-recovery fixes. None of this is signed YouTube TV playback acceptance.

- Run protected-playback, wake-recovery, sponsor, Live Games takeover, presentation and installed-update regressions.
- Run `electron scripts/electron-protected-playback.cjs <absolute-isolated-profile>` to verify actual Windows component installation, sandboxed H.264/AAC MediaKeys and BrowserView bounds. This uses no provider account and does not prove YouTube TV playback.
- Validate the actual packaged ZIP and installer with `verify-installed-package.cjs`, including A/B staging and unpacked helpers.
- With a production VMP-signed candidate, sign in to the owner's YouTube TV account on the test TV Box. Verify an entitled live channel, audio, complete video aspect ratio, player fullscreen retaining sponsors, channel selection, refresh, login persistence, stop/auto-off, Live Games takeover/return, offline/reconnect and cold restart.
- Verify installed 2.0.1 -> 2.1.0 update and rollback on the test box before authorizing production. A major Chromium upgrade can migrate profile data; old-runtime session compatibility requires physical verification. Keep the prior runtime and a secured local profile backup. Do not infer this from mocked recovery tests.
- If YouTube TV rejects the signed embedded client, record the actual provider error and investigate supported integration. Do not change user agent, weaken sandbox/navigation rules or bypass DRM to claim compatibility.

## Sources

- https://github.com/castlabs/electron-releases
- https://github.com/castlabs/electron-releases/wiki/EVS
- https://github.com/castlabs/electron-releases/wiki/FAQ
- https://github.com/castlabs/electron-releases/blob/v44.1.0%2Bwvcus/docs/api/components.md

The EverPass PWA limitation remains separate and unchanged. This candidate does not establish EverPass support or provider permission for venue use.
