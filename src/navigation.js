const SERVICE_HOSTS = ["youtube.com", "youtu.be", "hulu.com", "espn.com", "peacocktv.com", "twitch.tv", "primevideo.com", "amazon.com", "paramountplus.com"];
// Authentication redirects stay within provider-owned HTTPS origins.
const LOGIN_HOSTS = ["accounts.google.com", "accounts.youtube.com", "mydisney.com", "disneyplus.com"];
function allowedNavigation(value, apiBase, token) {
  try {
    if (typeof value !== "string" || value.length > 4096) return false;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (url.origin === apiBase) return url.pathname === "/tv/pair"
      || (Boolean(token) && url.pathname === `/tv/${token}`);
    return [...SERVICE_HOSTS, ...LOGIN_HOSTS].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
module.exports = { allowedNavigation };
