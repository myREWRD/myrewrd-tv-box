const {resumeUrl}=require('./game-day-provider');

// Arm before dispatching effects: trusted input invalidates even queued commands.
function armResume(expectedPage,id,deadline) {
  if(location.origin+location.pathname!==expectedPage || Date.now()>deadline)return false;
  let state=globalThis.myrewrdResumeState;
  if(!state){
    state=globalThis.myrewrdResumeState={};
    for(const name of ['pointerdown','touchstart','wheel','keydown'])document.addEventListener(name,event=>{if(event.isTrusted)state.cancelled=true;},true);
  }
  if(state.id!==id){state.id=id;state.cancelled=false;state.liveAttempted=false;}
  return !state.cancelled;
}
// Do not await media.play(): media startup can remain pending indefinitely.
function resumePlayback(expectedPage,id,deadline) {
  const state=globalThis.myrewrdResumeState;
  const valid=()=>state?.id===id && !state.cancelled && Date.now()<=deadline && location.origin+location.pathname===expectedPage;
  if(!valid())return 'cancelled';
  if(location.origin+location.pathname!==expectedPage)return 'navigation';
  if([...document.querySelectorAll('input[type="password"],input[type="email"],input[autocomplete="username"],input[autocomplete="one-time-code"]')].some(e=>e.getClientRects().length))return 'sign-in';
  const videos=[...document.querySelectorAll('video')].filter(v=>{
    const r=v.getBoundingClientRect();return !v.ended && Boolean(v.currentSrc || v.src || v.querySelector('source')) && r.width>=200 && r.height>=100;
  }).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);
  const video=videos[0];if(!video)return 'not-ready';
  // Ask the provider to return to live only when it exposes that exact action.
  // Never seek a finite-duration VOD to its end or invent channel identifiers.
  const live=[...document.querySelectorAll('button,[role="button"]')].find(e=>{
    const r=e.getBoundingClientRect();const label=(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim();
    return !e.disabled && r.width>0 && r.height>0 && /^(?:go live|back to live|jump to live|return to live)$/i.test(label);
  });
  if(live && !state.liveAttempted){state.liveAttempted=true;live.click();}
  if(!valid() || !video.isConnected || ![...document.querySelectorAll('video')].includes(video))return 'navigation';
  if(!video.paused)return 'playing';
  try{Promise.resolve(video.play()).catch(()=>{});return 'requested';}catch{return 'waiting';}
}
function createProviderResume({getView,getProvider,canResume,now=Date.now}) {
  let pending=null,sequence=0;
  const observed=new WeakSet();
  function observe(contents){
    if(observed.has(contents))return;observed.add(contents);
    const cancel=()=>{if(pending?.contents===contents)pending=null;};
    contents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown')cancel();});
    contents.on('before-mouse-event',(_event,input)=>{if(['mouseDown','mouseWheel'].includes(input.type))cancel();});
    const navigation=(_event,url,isMainFrame=true)=>{
      const job=pending;if(!isMainFrame || job?.contents!==contents || url.startsWith('file:'))return;
      if(resumeUrl(job.provider,url)!==job.target)cancel();
    };
    contents.on('did-navigate',(_event,url)=>navigation(_event,url));
    contents.on('did-navigate-in-page',navigation);
  }
  return {
    request(contents,url){
      const provider=getProvider(),target=resumeUrl(provider,url);pending=null;if(!target)return;
      observe(contents);pending={contents,provider,target,id:String(++sequence),deadline:now()+60000,attempts:0,next:0,busy:false};
    },
    cancel(){pending=null;},
    async tick(){
      const job=pending;if(!job)return;
      const contents=getView()?.webContents;
      if(contents!==job.contents || contents?.isDestroyed() || getProvider()!==job.provider || now()>job.deadline){if(pending===job)pending=null;return;}
      if(job.busy || !canResume() || contents.isLoading() || now()<job.next)return;
      const target=resumeUrl(job.provider,contents.getURL());if(target!==job.target)return;
      if(job.attempts>=3){if(pending===job)pending=null;return;}
      job.busy=true;job.next=now()+3000;
      try{
        const args=[target,job.id,job.deadline].map(v=>JSON.stringify(v)).join(',');
        const armed=await contents.executeJavaScriptInIsolatedWorld(1005,[{code:`(${armResume.toString()})(${args})`}],true);
        if(pending!==job || !armed || now()>job.deadline)return;
        const result=await contents.executeJavaScriptInIsolatedWorld(1005,[{code:`(${resumePlayback.toString()})(${args})`}],true);
        if(['playing','sign-in','cancelled','navigation'].includes(result)){if(pending===job)pending=null;}
        else if(!['navigation','not-ready'].includes(result))job.attempts++;
      }catch{job.attempts++;}finally{job.busy=false;}
    }
  };
}
module.exports={createProviderResume,resumePlayback,armResume};
