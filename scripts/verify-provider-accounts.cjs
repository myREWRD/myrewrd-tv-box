const assert=require('node:assert/strict');const {runHuluLogin:runLogin,allowedLoginUrl,validJob,credentialStepCode}=require('../src/provider-account-login');
const {createProviderAccounts}=require('../src/provider-accounts');
const runHuluLogin=options=>runLogin({...options,formFactory:contents=>({execute:(step,value,username)=>contents.isLoadingMainFrame()?Promise.resolve('not_ready'):contents.executeJavaScriptInIsolatedWorld(1005,[{code:credentialStepCode(step,value,'hulu',username)}]),dispose(){}})});
const now=1000000;const makeJob=()=>({id:'11111111-1111-4111-8111-111111111111',provider:'hulu',remaining_ms:120000,expires_at:new Date(now+120000).toISOString(),credentials:{username:'fixture@example.invalid',password:'test-only-fixture'}});
for(const url of ['http://auth.hulu.com/web/login','https://auth.hulu.com.evil.invalid/web/login','https://evil@auth.hulu.com/web/login','https://auth.hulu.com:444/web/login','https://auth.hulu.com/web/signup'])assert.equal(allowedLoginUrl(url),false);
assert.equal(allowedLoginUrl('https://auth.hulu.com/web/login/enter-password'),true);
assert.equal(allowedLoginUrl('https://www.peacocktv.com/signin','peacock'),true);
for(const url of ['https://www.peacocktv.com.evil.invalid/signin','https://www.peacocktv.com/forgot','https://auth.hulu.com/web/login/enter-password','https://evil@www.peacocktv.com/signin'])assert.equal(allowedLoginUrl(url,'peacock'),false);
assert.equal(validJob({...makeJob(),provider:'peacock'},now),true);
assert.equal(validJob({...makeJob(),provider:'youtube'},now),false);assert.equal(validJob({...makeJob(),expires_at:new Date(now-1).toISOString()},now),false);
assert.ok(credentialStepCode('password','";throw new Error("unsafe")').includes(JSON.stringify('";throw new Error("unsafe")')));
let mode='normal',lastWindow,execCount=0,validContext=true,permissionChecks=[],rejectInitialLoad,resolveExecution;
class FakeWindow {
 constructor(options){assert.equal(options.show,false);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.sandbox,true);lastWindow=this;this.destroyed=false;let url='';const handlers={};this.webContents={
  setWindowOpenHandler:fn=>assert.equal(fn({url:'https://example.invalid'}).action,'deny'),on:(name,fn)=>{handlers[name]=fn;},
  session:{setPermissionCheckHandler(fn){permissionChecks.push(fn);},setPermissionRequestHandler(fn){if(fn){assert.equal(permissionChecks.at(-1)(null),false);assert.equal(permissionChecks.at(-1)(thisWindow.webContents),false);assert.equal(permissionChecks.at(-1)({},'media'),false);assert.equal(permissionChecks.at(-1)({},'mediaKeySystem'),true);if(mode==='permission'){for(const wc of [null,thisWindow.webContents])fn(wc,'geolocation',allowed=>assert.equal(allowed,false));}}}},
  loadURL:async next=>{if(mode.startsWith('redirect-')){let prevented=false;handlers['will-redirect']({url:'https://unapproved.invalid/path',...(mode==='redirect-unknown'?{}:{isMainFrame:mode==='redirect-main'}),preventDefault(){prevented=true;}});assert.equal(prevented,true);}url=mode==='wrong'?'https://attacker.invalid':next;if(mode==='pending-load')await new Promise(()=>{});if(mode==='aborted-load')await new Promise((_resolve,reject)=>{rejectInitialLoad=reject;});},getURL:()=>url,isLoading:()=>mode==='pending-load',isLoadingMainFrame:()=>mode==='loading-main',
  executeJavaScriptInIsolatedWorld:async(world,scripts)=>{if(mode==='pending-script')return await new Promise(resolve=>{resolveExecution=resolve;});execCount++;assert.equal(world,1005);assert.ok(scripts[0].code.includes('location.origin'));
   if(url.endsWith('enter-email')){url='https://auth.hulu.com/web/login/enter-password';if(mode==='aborted-load'){rejectInitialLoad(Error('ERR_ABORTED'));await new Promise(resolve=>setImmediate(resolve));}if(mode==='rekey')validContext=false;}else url=mode==='challenge'?'https://auth.hulu.com/web/login/verification':'https://www.hulu.com/';return 'submitted';}};const thisWindow=this;
 }
 isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}
}
(async()=>{
 let job=makeJob();assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job,signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'submitted');
 assert.equal(execCount,2);assert.equal(lastWindow.destroyed,true);assert.equal(job.credentials.password,'');assert.equal(job.credentials.username,'');
 assert.equal(permissionChecks.at(-1),null);
 mode='pending-load';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'submitted');assert.equal(execCount,2);assert.equal(lastWindow.destroyed,true);
 mode='aborted-load';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'submitted');assert.equal(execCount,2);
 mode='loading-main';execCount=0;let clock=now;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>clock,delay:async ms=>{clock+=ms;}}),'failed');assert.equal(execCount,0);assert.equal(clock,now+108000);assert.equal(lastWindow.destroyed,true);
 for(const redirectMode of ['redirect-child','redirect-main','redirect-unknown']){mode=redirectMode;execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),redirectMode==='redirect-child'?'submitted':'manual_required');assert.equal(execCount,redirectMode==='redirect-child'?2:0);}
 mode='permission';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'manual_required');assert.equal(execCount,0);assert.equal(permissionChecks.at(-1),null);
 mode='wrong';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'manual_required');assert.equal(execCount,0);
 mode='challenge';assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'verification_required');assert.equal(lastWindow.destroyed,true);
 mode='rekey';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,isCurrent:()=>validContext,now:()=>now,delay:async()=>{}}),'failed');assert.equal(execCount,1);assert.equal(lastWindow.destroyed,true);
 mode='pending-script';validContext=true;const cancelPending=new AbortController();const pendingJob=makeJob();
 const pendingLogin=runHuluLogin({BrowserWindow:FakeWindow,job:pendingJob,signal:cancelPending.signal,now:()=>now});
 await new Promise(resolve=>setImmediate(resolve));cancelPending.abort();assert.equal(lastWindow.destroyed,true);assert.equal(pendingJob.credentials.password,'');assert.equal(permissionChecks.at(-1),null);
 // Simulate a new attempt owning the session before old execution settles.
 const nextPermissionOwner=()=>false;permissionChecks.push(nextPermissionOwner);resolveExecution('submitted');await pendingLogin;assert.equal(permissionChecks.at(-1),nextPermissionOwner,'late cleanup cannot clear a newer permission owner');
 mode='normal';
 let polls=0,logins=0,privateStarts=0,reports=[];job=makeJob();
 const worker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'test-token',getKey:()=> 'test-key',canPoll:()=>true,onPrivateStart:()=>privateStarts++,now:()=>now,
  fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(body.action==='report'){reports.push(body);return {ok:true,text:async()=>JSON.stringify({ok:true})};}polls++;return {ok:true,text:async()=>JSON.stringify({job})};},
  login:async()=>{logins++;assert.equal(worker.active,true);return 'submitted';}});
 await worker.tick();await worker.tick();assert.equal(logins,1);assert.equal(privateStarts,1);assert.equal(worker.active,false);assert.equal(reports.length,1);assert.equal(JSON.stringify(reports).includes('test-only-fixture'),false);
 let key='first',aborted=false;
 const rekeyWorker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'test-token',getKey:()=>key,canPoll:()=>true,onPrivateStart:()=>{},now:()=>now,
 fetcher:async()=>({ok:true,text:async()=>JSON.stringify({job:makeJob()})}),login:async({signal})=>{key='second';await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));return 'failed';}});
 await rekeyWorker.tick();assert.equal(aborted,true);assert.equal(rekeyWorker.active,false);
 // A provider injection may never settle. Its private surface must be closed
 // before the lock releases, while reporting retains its own live signal.
 let privateClosed=false,lateResolve,timeoutReports=[];
 const deadlineWorker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'test-token',getKey:()=> 'test-key',canPoll:()=>true,onPrivateStart:()=>{},
 fetcher:async(_url,options)=>{const body=JSON.parse(options.body);if(body.action==='report'){assert.equal(privateClosed,true);assert.equal(options.signal.aborted,false);timeoutReports.push(body);return {ok:true,text:async()=>JSON.stringify({ok:true})};}return {ok:true,text:async()=>JSON.stringify({job:{...makeJob(),remaining_ms:12040,expires_at:new Date(Date.now()+12040).toISOString()}})};},
 login:({signal})=>new Promise(resolve=>{lateResolve=resolve;signal.addEventListener('abort',()=>{privateClosed=true;},{once:true});})});
 await deadlineWorker.tick();assert.equal(deadlineWorker.active,false);assert.deepEqual(timeoutReports.map(({status,reason})=>({status,reason})),[{status:'failed',reason:'attempt_expired'}]);
 lateResolve('submitted');await new Promise(resolve=>setImmediate(resolve));assert.equal(timeoutReports.length,1);

 // Database-relative budgets must survive skewed and jumping Windows clocks.
 for(const wall of [now-86400000,now+86400000]) {
   let local=wall,mono=100,started=0;const diagnostics=[];
   const skewWorker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'fixture-token',getKey:()=> 'fixture-key',canPoll:()=>true,onPrivateStart:()=>{},now:()=>local,monotonic:()=>mono,diagnose:r=>diagnostics.push(r),
    fetcher:async(_u,o)=>{if(JSON.parse(o.body).action==='report')return {ok:true,text:async()=>'{"ok":true}'};mono+=700;return {ok:true,text:async()=>JSON.stringify({job:makeJob()})};},
    login:async({remaining})=>{started++;assert.equal(remaining(),119300);local+=172800000;mono+=300;assert.equal(remaining(),119000);return 'submitted';}});
   await skewWorker.tick();await skewWorker.tick();assert.equal(started,1);assert.ok(diagnostics.some(r=>r.events.some(e=>e.stage==='report_accepted')));
   assert.ok(!JSON.stringify(diagnostics).includes('fixture-token'));assert.ok(!JSON.stringify(diagnostics).includes('fixture@example'));
 }
 for(const scenario of ['invalid-budget','slow-response','private-start','bad-report','non-json','poll-error','cancelled']) {
   let mono=0,called=0,sent=0,events=[],eligible=true;
   const worker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'fixture-token',getKey:()=> 'fixture-key',canPoll:()=>eligible,now:()=>now,monotonic:()=>mono,diagnose:r=>{events=r.events;},
    onPrivateStart:()=>{if(scenario==='private-start')throw Error('secret-bearing exception must not escape');if(scenario==='cancelled')eligible=false;},
    fetcher:async(_u,o)=>{if(JSON.parse(o.body).action==='report'){sent++;return {ok:true,text:async()=>scenario==='bad-report'?'{"ok":false}':'{"ok":true}'};}if(scenario==='poll-error')return {ok:false};if(scenario==='slow-response')mono+=119000;return {ok:true,text:async()=>scenario==='non-json'?'bad json':JSON.stringify({job:{...makeJob(),remaining_ms:scenario==='invalid-budget'?120001:120000}})};},
    login:async()=>{called++;return 'submitted';}});
   await worker.tick();assert.equal(worker.active,false);
   assert.equal(called,scenario==='bad-report'?1:0);assert.equal(sent,['private-start','bad-report'].includes(scenario)?1:0);
   assert.equal(events.at(-1).stage,{'invalid-budget':'invalid_job','slow-response':'insufficient_budget','private-start':'report_accepted','bad-report':'report_rejected','non-json':'request_failed','poll-error':'poll_rejected','cancelled':'cancelled'}[scenario]);
 }
 console.log('PASS provider accounts: exact origins, bounded jobs, hidden sandboxed window, fixed email/password steps, challenge refusal, cleanup, private lock and no credential replay/report leakage.');
})().catch(error=>{console.error(error);process.exitCode=1;});
