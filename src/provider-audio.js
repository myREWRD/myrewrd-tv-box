// Fixed media-only operation in the provider's isolated world. No page text,
// credentials, URLs or caller-supplied JavaScript leave the renderer.
function mediaMuteCode(muted, volume) {
  if (typeof muted !== 'boolean') throw new TypeError('Expected boolean mute state');
  if(volume!==undefined && (!Number.isInteger(volume) || volume<0 || volume>100))throw new TypeError('Invalid volume');
  return `(() => {
    if (location.protocol !== 'https:' || !['youtube.com','hulu.com','peacocktv.com','espn.com'].some(h => location.hostname === h || location.hostname.endsWith('.' + h)) || location.hostname.startsWith('accounts.')) return false;
    const muted = ${muted};
    const volume = ${volume===undefined?'null':volume/100};
    let count=0, matched=true;
    const visit = root => {
      for (const media of root.querySelectorAll('video,audio')) {
        media.muted = muted;
        if(volume!==null)media.volume=volume;
        else if (!muted && media.volume === 0) media.volume = 0.5;
        count++; matched=matched && media.muted===muted && (volume===null || Math.abs(media.volume-volume)<0.001);
      }
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot);
    };
    visit(document);
    return count>0 && matched;
  })()`;
}
module.exports = { mediaMuteCode };
