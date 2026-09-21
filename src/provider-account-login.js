// Explicit, single-use sign-in delivery. Never persist credentials, export
// cookies, accept a caller URL, or put a private sign-in window on the TV.
const HULU_LOGIN='https://auth.hulu.com/web/login/enter-email';
const PEACOCK_LOGIN='https://www.peacocktv.com/start';
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
function credentialStepCode(step,value,provider='hulu',username='') {
  if(!['email','password'].includes(step))throw Error('Unsupported login step');
  if(provider==='peacock')return `(() => {
    if(location.origin!=='https://www.peacocktv.com'||location.pathname!==${JSON.stringify(step==='email'?'/start':'/signin')}||window!==window.top)return 'unsupported';
    const field=document.querySelector(${JSON.stringify(step==='email'?'input#email[name="email"][type="text"]':'input#password[name="password"][type="password"]')});
    const buttons=[...(field?.closest('form')?.querySelectorAll('button')||[])].filter(b=>b.type==='submit'&&b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(step==='email'?'Continue':'Sign In')});
    if(!field||!field.getClientRects().length||field.disabled||buttons.length!==1)return 'not_ready';
    const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
    ${step==='password'?`const email=document.querySelector('input#userIdentifier[name="userIdentifier"][type="text"]');if(!email||!email.getClientRects().length||email.disabled)return 'unsupported';set(email,${JSON.stringify(username)});`:''}
    set(field,${JSON.stringify(value)});
    if(buttons[0].disabled)return 'not_ready';buttons[0].click();return 'submitted';
  })()`;
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
function playbackReturn(value,provider='hulu') {
  try {const u=new URL(value);return !u.username&&!u.password&&!u.port&&(provider==='peacock'
    ?u.origin==='https://www.peacocktv.com'&&['/watch/home','/watch/profiles'].includes(u.pathname)
    :provider==='hulu'&&u.origin==='https://www.hulu.com'&&['/','/hub/home','/profiles'].includes(u.pathname));}catch{return false;}
}
async function runHuluLogin({BrowserWindow,job,signal,isCurrent=()=>true,now=Date.now,remaining,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),diagnose=()=>{}}) {
  if(!validJob(job,now(),remaining?.())||signal.aborted||!isCurrent())return 'failed';
  const provider=job.provider;
  const finish=(status,reason)=>{diagnose(reason);return status;};
  let window;let privateSession;const attempted=new Set();let passwordSubmitted=false;
  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;
    if(window&&!window.isDestroyed())window.destroy();
    if(privateSession){privateSession.setPermissionRequestHandler(null);privateSession.setPermissionCheckHandler(null);}
    job.credentials.username='';job.credentials.password='';
  };
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
      if(!allowedLoginUrl(url,provider)&&!playbackReturn(url,provider)){event.preventDefault();denied=true;}
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
        if(contents.isLoadingMainFrame?.()){await delay(250);continue;}
        const pathname=new URL(url).pathname;
        const step=provider==='peacock'?(pathname==='/start'?'email':pathname==='/signin'?'password':null):(pathname==='/web/login/enter-email'?'email':pathname==='/web/login/enter-password'?'password':null);
        if(!step)return finish('verification_required','verification_step');
        if(!attempted.has(step)) {
          // Isolated code rechecks exact origin/path in the target document.
          if(!isCurrent()||signal.aborted)return 'failed';
          const value=step==='email'?job.credentials.username:job.credentials.password;
          formInspectionStarted=true;
          const result=await contents.executeJavaScriptInIsolatedWorld(1005,[{code:credentialStepCode(step,value,provider,job.credentials.username)}],true);
          if(result==='not_ready'){await delay(250);continue;}
          attempted.add(step);
          if(result!=='submitted')return finish('manual_required','form_changed');
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
