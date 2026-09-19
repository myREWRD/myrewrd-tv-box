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
    // ESPN's TV-provider handoff uses Adobe Pass before reaching Hulu login.
    // Permit only ESPN authentication routes on the exact production host.
    if (url.hostname === "sp.auth.adobe.com") return /^\/api\/v2\/authenticate\/ESPN\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      || (url.pathname === "/adobe-services/authenticate/saml" && url.searchParams.getAll("requestor_id").length === 1 && url.searchParams.get("requestor_id") === "ESPN");
    return [...SERVICE_HOSTS, ...LOGIN_HOSTS].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
module.exports = { allowedNavigation };
