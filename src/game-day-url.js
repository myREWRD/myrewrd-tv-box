// Public YouTube links use the same video-only layout as the web TV board.
// Provider home pages keep their normal signed-in browsing experience.
function gameDayUrl(input) {
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return input;
    let id;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:live|embed|shorts)\/([^/]+)\/?$/)?.[1];
    } else if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
  } catch { /* Navigation validation is enforced by the caller. */ }
  return input;
}
module.exports = { gameDayUrl };
