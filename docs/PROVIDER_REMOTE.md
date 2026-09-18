# Venue app remote candidate

Protocol 1 adds a restricted provider remote to Game Day. It depends on dashboard `/api/tv-remote` and its private command-table migration, plus the existing physically enrolled presentation key. Ordinary TV tokens alone are insufficient. The venue app chooses one device; existing venue-wide modes and legacy commands remain compatible.

Only fixed provider launch targets, navigation keys, normalized pointer/click, scrolling, back/reload and mute are accepted. No arbitrary text, URL, script, desktop input, screenshot or provider cookie is transmitted. Controls are disabled during presentation, update and provider authentication popups. Provider sign-in is performed directly on the box; no Google account is required for myREWRD app control.

Commands expire, are claimed once and are not replayed after a lost response. Applied means delivered to the view, not verified playback. The provider session uses the existing browser profile. This candidate depends on the protected-runtime and installed-updater work and must not be published without signed Windows build, physical device validation, updater recovery validation and owner approval. Keep the prior working artifact/configuration for recovery; never replace the global fleet offer to test this candidate.

Run `node scripts/verify-provider-remote.cjs` for input/worker cases, plus existing protected-playback, wake-recovery and takeover regressions. `scripts/verify-provider-remote-electron.cjs` is an attended synthetic Windows input fixture; it intercepts HTTPS locally and never accesses provider accounts. It requires a focused interactive desktop.

Canonical setup, security, compatibility and release evidence: dashboard `docs/product/TV_PROVIDER_REMOTE.md` and ADR 0018. No production remote rollout is implied by this source change.
