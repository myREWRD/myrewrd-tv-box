const { resumeUrl } = require('./game-day-provider');

// Runs only in the selected provider's isolated world, never in sign-in popups.
// Prefer the provider's own fullscreen button so its transport controls remain.
async function enterPlayerFullscreen(expectedPage, userDismissed = false) {
  if ((location.origin+location.pathname+(location.origin==='https://www.youtube.com' && location.pathname==='/watch'?'?v='+new URLSearchParams(location.search).get('v'):'')) !== expectedPage) return 'navigation';
  if ([...document.querySelectorAll('input[type="password"],input[type="email"],input[autocomplete="username"],input[autocomplete="one-time-code"]')].some(element=>element.getClientRects().length>0)) return 'sign-in';
  const videos = [...document.querySelectorAll('video')].filter(video => {
    const r = video.getBoundingClientRect();
    return !video.paused && !video.ended && video.readyState >= 2 && r.width >= 200 && r.height >= 100;
  }).sort((a,b) => b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);
  const video=videos[0];
  if(!video)return 'waiting';
  // One document-scoped lifecycle and budget, including replacement ad videos.
  let state=globalThis.myrewrdFullscreenState;
  if(!state){
    state=globalThis.myrewrdFullscreenState={requests:[],lastPointerAt:-Infinity};
    const pointerInput=event=>{
      if(event.isTrusted && document.fullscreenElement)state.lastPointerAt=Date.now();
    };
    document.addEventListener('pointerdown',pointerInput,true);
    document.addEventListener('pointerup',pointerInput,true);
    document.addEventListener('keydown',event=>{
      if(event.isTrusted && document.fullscreenElement && ['Escape','f','F'].includes(event.key))state.dismissed=true;
    },true);
    document.addEventListener('fullscreenchange',()=>{
      const full=document.fullscreenElement;
      if(full && state.video && (full===state.video || full.contains(state.video))){
        state.entered=true;state.attempts=0;
      } else if(!full && state.entered){
        state.entered=false;
        // Includes title-only buttons and native shadow-DOM fullscreen controls.
        if(Date.now()-state.lastPointerAt<1500)state.dismissed=true;
        state.buttonAttempted=false;state.retryAfter=Date.now()+4000;
        if(state.originalControls!==undefined && state.video){state.video.controls=state.originalControls;delete state.originalControls;}
      }
    });
  }
  if(state.page!==expectedPage){state.page=expectedPage;state.dismissed=false;state.attempts=0;state.buttonAttempted=false;}
  if(state.video!==video){
    if(state.video && state.originalControls!==undefined)state.video.controls=state.originalControls;
    delete state.originalControls;
    state.video=video;state.attempts=0;state.buttonAttempted=false;
  }
  if(userDismissed || state.dismissed)return 'dismissed';
  if(document.fullscreenElement){state.entered=true;return 'fullscreen';}
  if(state.retryAfter>Date.now())return 'waiting';
  if(state.buttonAttempted && Date.now()-state.requestedAt<3000)return 'waiting';
  if(state.attempts>=3)return 'unavailable';
  state.requests=state.requests.filter(at=>Date.now()-at<60000);
  if(state.requests.length>=3)return 'cooldown';
  const button=[...document.querySelectorAll('button,[role="button"]')].find(element=>{
    const label=[element.getAttribute('aria-label'),element.getAttribute('title'),element.getAttribute('data-testid'),element.textContent].filter(Boolean).join(' ');
    const r=element.getBoundingClientRect();
    return !element.disabled && r.width>0 && r.height>0 && /full[ -]?screen/i.test(label) && !/exit|leave|close|minimi[sz]e/i.test(label);
  });
  state.requests.push(Date.now());
  if(button && !state.buttonAttempted){
    state.buttonAttempted=true;state.requestedAt=Date.now();button.click();return 'requested';
  }
  state.attempts=(state.attempts||0)+1;
  state.originalControls=video.controls;video.controls=true;
  try { await video.requestFullscreen(); }
  catch {video.controls=state.originalControls;delete state.originalControls;return 'unavailable';}
  return document.fullscreenElement?'fullscreen':'waiting';
}

function createProviderFullscreen({getView,getProvider,canExpand}) {
  let pending=false;
  const sessions=new WeakMap();
  return { async tick() {
    if(pending || !canExpand()) return;
    const view=getView(), contents=view?.webContents;
    if(!contents || contents.isDestroyed() || contents.isLoading()) return;
    const url=contents.getURL();
    const target=resumeUrl(getProvider(),url);
    if(!target) return;
    let session=sessions.get(contents);
    if(!session){
      session={page:target,dismissed:false,expanded:false};sessions.set(contents,session);
      // Chromium can consume Escape before the page receives a key event.
      contents.on('before-input-event',(_event,input)=>{
        if(session.expanded && input.type==='keyDown' && ['Escape','f','F'].includes(input.key))session.dismissed=true;
      });
      contents.on('did-navigate',()=>{session.page='';session.dismissed=false;session.expanded=false;});
    }
    if(session.page!==target){session.page=target;session.dismissed=false;session.expanded=false;}
    pending=true;
    try {
      const result=await contents.executeJavaScriptInIsolatedWorld(1004,[{code:`(${enterPlayerFullscreen.toString()})(${JSON.stringify(target)},${session.dismissed})`}],true);
      session.expanded=result==='fullscreen' || result==='requested';
    } catch { /* Navigation/destruction is normal; never log provider contents. */ }
    finally {pending=false;}
  }};
}
module.exports={createProviderFullscreen,enterPlayerFullscreen};
