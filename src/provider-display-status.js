const { HOMES } = require('./game-day-provider');
function providerDisplayStatus({ mode, provider, contents, privateActive = false, unavailable = false }) {
  if (unavailable) return { mode: 'unavailable', provider: null };
  if (privateActive) return { mode: 'private', provider: null };
  if (!['regular', 'stream', 'gameday', 'live-game'].includes(mode)) return { mode: 'unavailable', provider: null };
  if (mode !== 'gameday') return { mode, provider: null };
  let open = null;
  try {
    if (Object.hasOwn(HOMES, provider) && contents && !contents.isDestroyed() && !contents.isLoading()) {
      const url = new URL(contents.getURL());
      if (url.origin === new URL(HOMES[provider]).origin && !url.username && !url.password) open = provider;
    }
  } catch { /* Navigation/destruction can race a status sample. */ }
  return { mode, provider: open };
}
module.exports = { providerDisplayStatus };
