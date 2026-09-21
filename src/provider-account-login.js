const path=require('node:path');
const {credentialStepCode}=require('./provider-account-preload');
const {createPrivateForm}=require('./provider-account-form');
const {denyPrivatePermissions}=require('./private-permissions');
const {applyProviderUserAgent}=require('./provider-user-agent');
// Explicit, single-use sign-in delivery. Never persist credentials, export
// cookies, accept a caller URL, or put a private sign-in window on the TV.
const HULU_LOGIN='https://auth.hulu.com/web/login/enter-email';
const PEACOCK_LOGIN='https://www.peacocktv.com/signin';
function allowedLoginUrl(value,provider='hulu') {
  try {const u=new URL(value);return !u.username&&!u.password&&!u.port&&(provider==='peacock'
    ?u.origin==='https://www.peacocktv.com'&&['/start','/signin'].includes(u.pathname)
    :provider==='hulu'&&u.origin==='https://auth.hulu.com'&&/^\/web\/login(?:\/|$)/.test(u.pathname));}catch{return false;}
}
function validJob(job,now=Date.now(),remainingMs) {
  return job&&/^[a-f0-9-]{36}$/i.test(job.id||'')&&['hulu','peacock'].includes(job.provider)
    &&Number.isFinite(Date.parse(job.expires_at))
    &&(remainingMs===undefined ? Date.parse(job.expires_at)>now&&Date.parse(job.expires_at)<=now+120000
      : Number.isFinite(remainingMs)&&remainingMs>0&&remainingMs<=120000)
    &&typeof job.credentials?.username==='string'&&job.credentials.username.length>0&&job.credentials.username.length<=320
    &&typeof job.credentials?.password==='string'&&job.credentials.password.length>0&&job.credentials.password.length<=1024;
}
// Exact form steps observed on the provider's official sign-in UI. Unknown
// documents and forms receive no credentials, even on an allowed hostname.

function playbackReturn(value,provider='hulu') {
  try {const u=new URL(value);return !u.username&&!u.password&&!u.port&&(provider==='peacock'
    ?u.origin==='https://www.peacocktv.com'&&['/watch/home','/watch/profiles'].includes(u.pathname)
    :provider==='hulu'&&u.origin==='https://www.hulu.com'&&['/','/hub/home','/profiles'].includes(u.pathname));}catch{return false;}
}
async function runHuluLogin({BrowserWindow,job,signal,isCurrent=()=>true,now=Date.now,remaining,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),diagnose=()=>{},progress=()=>{},formFactory=createPrivateForm}) {
  if(!validJob(job,now(),remaining?.())||signal.aborted||!isCurrent())return 'failed';
  const provider=job.provider;
  const finish=(status,reason)=>{diagnose(reason);return status;};
  let window;let releasePermissions;let form;const attempted=new Set();let passwordSubmitted=false;
  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;
    form?.dispose();
    if(window&&!window.isDestroyed())window.destroy();
    releasePermissions?.();
    job.credentials.username='';job.credentials.password='';
  };
  try {
    window=new BrowserWindow({show:false,width:1000,height:800,skipTaskbar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,devTools:false,preload:path.join(__dirname,'provider-account-preload.js')}});
    const contents=window.webContents;
    applyProviderUserAgent(contents,provider==='peacock'?PEACOCK_LOGIN:HULU_LOGIN);
    form=formFactory(contents,{provider,isCurrent:()=>!signal.aborted&&isCurrent(),allowed:url=>allowedLoginUrl(url,provider),replyAllowed:url=>allowedLoginUrl(url,provider)||playbackReturn(url,provider),progress});
    let permissionRequested=false;
    releasePermissions=denyPrivatePermissions(contents,()=>{permissionRequested=true;});
    // Never let provider popups create a visible credential surface.
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    let denied=false;
    for(const eventName of ['will-navigate','will-redirect'])contents.on(eventName,(event,legacyUrl,_inPlace,legacyMainFrame)=>{
      const url=event.url??legacyUrl;
      if(!allowedLoginUrl(url,provider)&&!playbackReturn(url,provider)){
        event.preventDefault();
        // A blocked analytics/subframe redirect is not a failed main-document
        // sign-in. Unknown frame identity still fails closed. Credential writes
        // remain restricted to the exact top-level provider form.
        if((event.isMainFrame??legacyMainFrame)!==false)denied=true;
      }
    });
    const abort=cleanup;signal.addEventListener('abort',abort,{once:true});
    try {
      // A provider's analytics/subresource request can keep loadURL pending long
      // after its form is interactive. Observe navigation without awaiting full
      // page load; exact-document checks below still gate every credential.
      let navigationFailed=false,formInspectionStarted=false;
      void contents.loadURL(provider==='peacock'?PEACOCK_LOGIN:HULU_LOGIN).catch(()=>{if(!formInspectionStarted)navigationFailed=true;});
      while(!signal.aborted&&isCurrent()&&!window.isDestroyed()&&(remaining?remaining()>12000:now()<Date.parse(job.expires_at)-12000)) {
        if(navigationFailed)return finish('failed','navigation_failed');
        if(denied)return finish('manual_required','redirect_blocked');
        if(permissionRequested)return finish('manual_required','permission_required');
        const url=contents.getURL();
        if(playbackReturn(url,provider))return finish(passwordSubmitted?'submitted':'manual_required',passwordSubmitted?'password_submitted':'existing_session');
        if(!url||url==='about:blank'){await delay(250);continue;}
        if(!allowedLoginUrl(url,provider))return finish('manual_required','document_blocked');
        const pathname=new URL(url).pathname;
        const step=provider==='peacock'?(pathname==='/start'?'email':pathname==='/signin'?'password':null):(pathname==='/web/login/enter-email'?'email':pathname==='/web/login/enter-password'?'password':null);
        if(!step)return finish('verification_required','verification_step');
        if(!attempted.has(step)) {
          // Isolated code rechecks exact origin/path in the target document.
          if(!isCurrent()||signal.aborted)return 'failed';
          const value=step==='email'?job.credentials.username:job.credentials.password;
          formInspectionStarted=true;
          const result=await form.execute(step,value,job.credentials.username);
          if(result==='not_ready'){await delay(250);continue;}
          attempted.add(step);
          if(result!=='submitted')return finish('manual_required','form_changed');
          progress(step==='password'?'form_password_submitted':'form_email_submitted');
          if(step==='password')passwordSubmitted=true;
        }
        await delay(500);
      }
      return finish('failed','attempt_expired');
    }finally{signal.removeEventListener('abort',abort);}
  }catch{return finish('failed','receiver_error');}
  finally {
    cleanup();
  }
}
module.exports={HULU_LOGIN,PEACOCK_LOGIN,allowedLoginUrl,validJob,credentialStepCode,playbackReturn,runHuluLogin};
