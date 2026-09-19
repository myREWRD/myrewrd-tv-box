const { resumeUrl } = require('./game-day-provider');

// Runs only in the selected provider's isolated world, never in sign-in popups.
// Prefer the provider's own fullscreen button so its transport controls remain.
async function enterPlayerFullscreen(expectedPage) {
  if (location.origin + location.pathname !== expectedPage) return 'navigation';
  if ([...document.querySelectorAll('input[type="password"],input[type="email"],input[autocomplete="username"],input[autocomplete="one-time-code"]')].some(element=>element.getClientRects().length>0)) return 'sign-in';
  const videos = [...document.querySelectorAll('video')].filter(video => {
    const r = video.getBoundingClientRect();
    return !video.paused && !video.ended && video.readyState >= 2 && r.width >= 200 && r.height >= 100;
  }).sort((a,b) => b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);
  const video = videos[0];
  if (!video) return 'waiting';
  const state = globalThis.myrewrdFullscreenState ||= new WeakMap();
  let prior = state.get(video);
  if (document.fullscreenElement) { state.set(video,{done:true}); return 'fullscreen'; }
  if (prior?.done || prior?.attempts >= 3) {
    if(prior?.observer)document.removeEventListener('fullscreenchange',prior.observer);
    return 'dismissed';
  }
  if(!prior?.observer){
    const observer=()=>{
      const full=document.fullscreenElement;
      if(full && (full===video || full.contains(video))){
        state.set(video,{done:true});
        document.removeEventListener('fullscreenchange',observer);
      }
    };
    document.addEventListener('fullscreenchange',observer);
    prior={...prior,observer};
  }
  state.set(video,{...prior,attempts:(prior?.attempts || 0)+1});
  const buttons = [...document.querySelectorAll('button,[role="button"]')];
  const button = buttons.find(element => {
    const label = [element.getAttribute('aria-label'),element.getAttribute('title'),element.getAttribute('data-testid'),element.textContent].filter(Boolean).join(' ');
    const r = element.getBoundingClientRect();
    return !element.disabled && r.width > 0 && r.height > 0 && /full[ -]?screen/i.test(label) && !/exit|leave|close|minimi[sz]e/i.test(label);
  });
  if (button && !prior?.buttonAttempted) {
    state.set(video,{...prior,attempts:0,buttonAttempted:true,requestedAt:Date.now()});
    button.click();
    return 'requested'; // Provider fullscreen settles asynchronously.
  }
  if (prior?.buttonAttempted && Date.now()-prior.requestedAt < 3000) {
    state.set(video,prior);
    return 'waiting';
  }
  // Fallback to the existing media element's native fullscreen, without moving
  // or replacing it. Native controls preserve an exit/play/volume UI.
  const originalControls=video.controls;
  video.controls=true;
  const restoreControls=()=>{
    if(document.fullscreenElement===video)return;
    video.controls=originalControls;
    document.removeEventListener('fullscreenchange',restoreControls);
  };
  document.addEventListener('fullscreenchange',restoreControls);
  try { await video.requestFullscreen(); }
  catch { document.removeEventListener('fullscreenchange',restoreControls);video.controls=originalControls;return 'unavailable'; }
  if (document.fullscreenElement) { state.set(video,{done:true}); return 'fullscreen'; }
  return 'waiting';
}

function createProviderFullscreen({getView,getProvider,canExpand}) {
  let pending=false;
  return { async tick() {
    if(pending || !canExpand()) return;
    const view=getView(), contents=view?.webContents;
    if(!contents || contents.isDestroyed() || contents.isLoading()) return;
    const url=contents.getURL();
    const target=resumeUrl(getProvider(),url);
    if(!target) return;
    pending=true;
    try {
      await contents.executeJavaScriptInIsolatedWorld(1004,[{code:`(${enterPlayerFullscreen.toString()})(${JSON.stringify(target)})`}],true);
    } catch { /* Navigation/destruction is normal; never log provider contents. */ }
    finally {pending=false;}
  }};
}
module.exports={createProviderFullscreen,enterPlayerFullscreen};
