// Explicit, single-use sign-in delivery. Never persist credentials, export
// cookies, accept a caller URL, or put a private sign-in window on the TV.
const HULU_LOGIN='https://auth.hulu.com/web/login/enter-email';
function allowedLoginUrl(value) {
  try {const u=new URL(value);return !u.username&&!u.password&&!u.port&&u.origin==='https://auth.hulu.com'&&/^\/web\/login(?:\/|$)/.test(u.pathname);}catch{return false;}
}
function validJob(job,now=Date.now()) {
  return job&&/^[a-f0-9-]{36}$/i.test(job.id||'')&&job.provider==='hulu'
    &&Date.parse(job.expires_at)>now&&Date.parse(job.expires_at)<=now+120000
    &&typeof job.credentials?.username==='string'&&job.credentials.username.length>0&&job.credentials.username.length<=320
    &&typeof job.credentials?.password==='string'&&job.credentials.password.length>0&&job.credentials.password.length<=1024;
}
// Exact form steps observed on the provider's official sign-in UI. Unknown
// documents and forms receive no credentials, even on an allowed hostname.
function credentialStepCode(step,value) {
  if(!['email','password'].includes(step))throw Error('Unsupported login step');
  const selector=step==='email'?'input#email-field[type="email"]':'input#password[type="password"]';
  const button=step==='email'?'Continue':'Log In';
  return `(() => {
    if(location.origin!=='https://auth.hulu.com'||location.pathname!==${JSON.stringify('/web/login/enter-'+step)}||window!==window.top)return 'unsupported';
    const field=document.querySelector(${JSON.stringify(selector)});
    if(!field||field.getClientRects().length!==1||field.disabled)return 'unsupported';
    const buttons=[...document.querySelectorAll('button[type="submit"]')].filter(b=>b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(button)});
    if(buttons.length!==1)return 'unsupported';
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
    if(buttons[0].disabled)return 'unsupported';buttons[0].click();return 'submitted';
  })()`;
}
function playbackReturn(value) {
  try {const u=new URL(value);return u.origin==='https://www.hulu.com'&&!u.username&&!u.password&&!u.port&&['/','/hub/home','/profiles'].includes(u.pathname);}catch{return false;}
}
async function runHuluLogin({BrowserWindow,job,signal,isCurrent=()=>true,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if(!validJob(job,now())||signal.aborted||!isCurrent())return 'failed';
  let window;let privateSession;const attempted=new Set();let passwordSubmitted=false;
  try {
    window=new BrowserWindow({show:false,width:1000,height:800,skipTaskbar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,devTools:false}});
    const contents=window.webContents;
    privateSession=contents.session;
    // The app previously used Electron's default permission behavior. Preserve
    // that for its existing windows, but never auto-grant a permission to this
    // new hidden sign-in surface. Account submission is not location consent.
    let permissionRequested=false;
    privateSession.setPermissionCheckHandler(wc=>Boolean(wc)&&wc!==contents);
    privateSession.setPermissionRequestHandler((wc,_permission,callback)=>{
      if(!wc||wc===contents){permissionRequested=true;callback(false);}else callback(true);
    });
    // Never let provider popups create a visible credential surface.
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    let denied=false;
    for(const eventName of ['will-navigate','will-redirect'])contents.on(eventName,(event,url)=>{
      if(!allowedLoginUrl(url)&&!playbackReturn(url)){event.preventDefault();denied=true;}
    });
    const abort=()=>{if(window&&!window.isDestroyed())window.destroy();};signal.addEventListener('abort',abort,{once:true});
    try {
      // A provider's analytics/subresource request can keep loadURL pending long
      // after its form is interactive. Observe navigation without awaiting full
      // page load; exact-document checks below still gate every credential.
      let navigationFailed=false;
      void contents.loadURL(HULU_LOGIN).catch(()=>{if(!attempted.size)navigationFailed=true;});
      while(!signal.aborted&&isCurrent()&&!window.isDestroyed()&&now()<Date.parse(job.expires_at)-12000) {
        if(navigationFailed)return 'failed';
        if(denied)return 'manual_required';
        if(permissionRequested)return 'manual_required';
        const url=contents.getURL();
        if(playbackReturn(url))return passwordSubmitted?'submitted':'manual_required';
        if(!url||url==='about:blank'){await delay(250);continue;}
        if(!allowedLoginUrl(url))return 'manual_required';
        if(contents.isLoadingMainFrame?.()){await delay(250);continue;}
        const pathname=new URL(url).pathname;
        const step=pathname==='/web/login/enter-email'?'email':pathname==='/web/login/enter-password'?'password':null;
        if(!step)return 'verification_required';
        if(!attempted.has(step)) {
          attempted.add(step);
          // Isolated code rechecks exact origin/path in the target document.
          if(!isCurrent()||signal.aborted)return 'failed';
          const value=step==='email'?job.credentials.username:job.credentials.password;
          const result=await contents.executeJavaScriptInIsolatedWorld(1005,[{code:credentialStepCode(step,value)}],true);
          if(result!=='submitted')return 'manual_required';
          if(step==='password')passwordSubmitted=true;
        }
        await delay(500);
      }
      return 'failed';
    }finally{signal.removeEventListener('abort',abort);}
  }catch{return 'failed';}
  finally {
    job.credentials.username='';job.credentials.password='';
    if(window&&!window.isDestroyed())window.destroy();
    if(privateSession){privateSession.setPermissionRequestHandler(null);privateSession.setPermissionCheckHandler(null);}
  }
}
module.exports={HULU_LOGIN,allowedLoginUrl,validJob,credentialStepCode,playbackReturn,runHuluLogin};
