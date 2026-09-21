// Peacock rejects the Electron product tokens during account lookup (HTTP 422).
// Preserve the real Chromium/OS versions. This changes browser identification
// only; it does not change permissions, sessions, navigation or DRM.
const profiles = new WeakMap();
function chromiumAgent(value) {
  return value.replace(/\s(?:Electron|myrewrd-tv-box|myREWRD-TV-Box)\/\S+/gi, '');
}
function peacockPage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port
    && ['www.peacocktv.com', 'peacocktv.com'].includes(u.hostname); } catch { return false; }
}
function applyProviderUserAgent(contents, url) {
  if (typeof contents.getUserAgent !== 'function' || typeof contents.setUserAgent !== 'function') return;
  let original = profiles.get(contents);
  if (!original) { original = contents.session?.getUserAgent?.() || contents.getUserAgent(); profiles.set(contents, original); }
  const next = peacockPage(url) ? chromiumAgent(original) : original;
  if (contents.getUserAgent() !== next) contents.setUserAgent(next);
}
function applyNavigationUserAgent(contents, eventName, event, url, legacyMainFrame) {
  const mainFrame = typeof event.isMainFrame === 'boolean' ? event.isMainFrame : legacyMainFrame;
  if (eventName === 'will-navigate' || mainFrame === true) applyProviderUserAgent(contents, url);
}
module.exports = { chromiumAgent, peacockPage, applyProviderUserAgent, applyNavigationUserAgent };
