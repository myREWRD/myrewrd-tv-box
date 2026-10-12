const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {runHuluLogin}=require('../src/provider-account-login');

async function scenario(provider,kind){
  const controller=new AbortController(),now=1000000;
  const home=provider==='hulu'?'https://www.hulu.com/':'https://www.peacocktv.com/watch/profiles';
  let window,url='',permissionRequest,permissionCheck,reason,submissions=0,denials=0,current=true;
  const job={id:'11111111-1111-4111-8111-111111111111',provider,remaining_ms:120000,expires_at:new Date(now+120000).toISOString(),credentials:{username:'fixture@example.invalid',password:'synthetic-password'}};
  class Window extends EventEmitter{
    constructor(){
      super();window=this;this.destroyed=false;const wc=new EventEmitter();this.webContents=wc;
      wc.session={setPermissionRequestHandler:fn=>permissionRequest=fn,setPermissionCheckHandler:fn=>permissionCheck=fn};
      wc.setWindowOpenHandler=()=>{};wc.getURL=()=>url;
      wc.loadURL=async next=>{
        url=next;
        if(kind==='existing-session'){url=home;requestDenied();}
        if(kind==='permission-login')requestDenied();
      };
    }
    isDestroyed(){return this.destroyed;}
    destroy(){this.destroyed=true;}
  }
  function requestDenied(){
    assert.equal(permissionCheck(window.webContents,'mediaKeySystem'),false);
    permissionRequest(window.webContents,'mediaKeySystem',allowed=>{assert.equal(allowed,false);denials++;});
  }
  const status=await runHuluLogin({BrowserWindow:Window,job,signal:controller.signal,now:()=>now,isCurrent:()=>current,
    remaining:()=>kind==='expired'?10000:120000,delay:async()=>{},diagnose:value=>reason=value,
    formFactory:()=>({dispose(){},execute:async step=>{
      submissions++;
      if(step==='email'){url='https://auth.hulu.com/web/login/enter-password';return 'submitted';}
      if(kind==='abort')controller.abort();
      if(kind==='binding-loss')current=false;
      if(kind==='delayed-return')requestDenied();
      else{
        url=kind==='near-match'?home+'unapproved':home;
        requestDenied();
        if(kind==='redirect-denied')window.webContents.emit('will-redirect',{isMainFrame:true,url:'https://unapproved.invalid/',preventDefault(){}});
      }
      return 'submitted';
    }})});
  assert.equal(window.destroyed,true);assert.equal(job.credentials.username,'');assert.equal(job.credentials.password,'');
  assert.equal(permissionRequest,null);assert.equal(permissionCheck,null);
  return {status,reason,submissions,denials};
}
(async()=>{
  for(const provider of ['hulu','peacock']){
    let r=await scenario(provider,'return');assert.equal(r.status,'submitted');assert.equal(r.reason,'password_submitted');assert.equal(r.denials,1);
    r=await scenario(provider,'existing-session');assert.equal(r.status,'manual_required');assert.equal(r.reason,'existing_session');assert.equal(r.submissions,0);
    for(const kind of ['permission-login','near-match','delayed-return']){
      r=await scenario(provider,kind);assert.equal(r.status,'manual_required');assert.equal(r.reason,'permission_required');
    }
    r=await scenario(provider,'redirect-denied');assert.equal(r.status,'manual_required');assert.equal(r.reason,'redirect_blocked');
    for(const kind of ['abort','binding-loss','expired']){r=await scenario(provider,kind);assert.equal(r.status,'failed');}
  }
  console.log('PASS saved-account outcomes: exact returns, denied permissions remain denied, existing sessions, delayed returns, navigation denial, abort/binding/expiry and credential cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
