// Fixed media-only operation in the provider's isolated world. No page text,
// credentials, URLs or caller-supplied JavaScript leave the renderer.
function mediaMuteCode(muted) {
  if (typeof muted !== 'boolean') throw new TypeError('Expected boolean mute state');
  return `(() => {
    if (location.protocol !== 'https:' || !['youtube.com','hulu.com','peacocktv.com','espn.com'].some(h => location.hostname === h || location.hostname.endsWith('.' + h)) || location.hostname.startsWith('accounts.')) return false;
    const muted = ${muted};
    const visit = root => {
      for (const media of root.querySelectorAll('video,audio')) {
        media.muted = muted;
        if (!muted && media.volume === 0) media.volume = 0.5;
      }
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot);
    };
    visit(document);
    return true;
  })()`;
}
module.exports = { mediaMuteCode };
