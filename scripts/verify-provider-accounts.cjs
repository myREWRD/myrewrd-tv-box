const assert=require('node:assert/strict');const {runHuluLogin,allowedLoginUrl,validJob,credentialStepCode}=require('../src/provider-account-login');
const {createProviderAccounts}=require('../src/provider-accounts');
const now=1000000;const makeJob=()=>({id:'11111111-1111-4111-8111-111111111111',provider:'hulu',expires_at:new Date(now+120000).toISOString(),credentials:{username:'fixture@example.invalid',password:'test-only-fixture'}});
for(const url of ['http://auth.hulu.com/web/login','https://auth.hulu.com.evil.invalid/web/login','https://evil@auth.hulu.com/web/login','https://auth.hulu.com:444/web/login','https://auth.hulu.com/web/signup'])assert.equal(allowedLoginUrl(url),false);
assert.equal(allowedLoginUrl('https://auth.hulu.com/web/login/enter-password'),true);
assert.equal(allowedLoginUrl('https://www.peacocktv.com/signin','peacock'),true);
for(const url of ['https://www.peacocktv.com.evil.invalid/signin','https://www.peacocktv.com/forgot','https://auth.hulu.com/web/login/enter-password','https://evil@www.peacocktv.com/signin'])assert.equal(allowedLoginUrl(url,'peacock'),false);
assert.equal(validJob({...makeJob(),provider:'peacock'},now),true);
assert.equal(validJob({...makeJob(),provider:'youtube'},now),false);assert.equal(validJob({...makeJob(),expires_at:new Date(now-1).toISOString()},now),false);
assert.ok(credentialStepCode('password','";throw new Error("unsafe")').includes(JSON.stringify('";throw new Error("unsafe")')));
let mode='normal',lastWindow,execCount=0,validContext=true,permissionChecks=[],rejectInitialLoad;
class FakeWindow {
 constructor(options){assert.equal(options.show,false);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.sandbox,true);lastWindow=this;this.destroyed=false;let url='';this.webContents={
  setWindowOpenHandler:fn=>assert.equal(fn({url:'https://example.invalid'}).action,'deny'),on:()=>{},
  session:{setPermissionCheckHandler(fn){permissionChecks.push(fn);},setPermissionRequestHandler(fn){if(fn){assert.equal(permissionChecks.at(-1)(null),false);assert.equal(permissionChecks.at(-1)(thisWindow.webContents),false);assert.equal(permissionChecks.at(-1)({}),true);if(mode==='permission'){for(const wc of [null,thisWindow.webContents])fn(wc,'geolocation',allowed=>assert.equal(allowed,false));}}}},
  loadURL:async next=>{url=mode==='wrong'?'https://attacker.invalid':next;if(mode==='pending-load')await new Promise(()=>{});if(mode==='aborted-load')await new Promise((_resolve,reject)=>{rejectInitialLoad=reject;});},getURL:()=>url,isLoading:()=>mode==='pending-load',isLoadingMainFrame:()=>mode==='loading-main',
  executeJavaScriptInIsolatedWorld:async(world,scripts)=>{execCount++;assert.equal(world,1005);assert.ok(scripts[0].code.includes('location.origin'));
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
 mode='permission';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'manual_required');assert.equal(execCount,0);assert.equal(permissionChecks.at(-1),null);
 mode='wrong';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'manual_required');assert.equal(execCount,0);
 mode='challenge';assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,now:()=>now,delay:async()=>{}}),'verification_required');assert.equal(lastWindow.destroyed,true);
 mode='rekey';execCount=0;assert.equal(await runHuluLogin({BrowserWindow:FakeWindow,job:makeJob(),signal:new AbortController().signal,isCurrent:()=>validContext,now:()=>now,delay:async()=>{}}),'failed');assert.equal(execCount,1);assert.equal(lastWindow.destroyed,true);
 let polls=0,logins=0,privateStarts=0,reports=[];job=makeJob();
 const worker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'test-token',getKey:()=> 'test-key',canPoll:()=>true,onPrivateStart:()=>privateStarts++,now:()=>now,
  fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(body.action==='report'){reports.push(body);return {ok:true};}polls++;return {ok:true,text:async()=>JSON.stringify({job})};},
  login:async()=>{logins++;assert.equal(worker.active,true);return 'submitted';}});
 await worker.tick();await worker.tick();assert.equal(logins,1);assert.equal(privateStarts,1);assert.equal(worker.active,false);assert.equal(reports.length,1);assert.equal(JSON.stringify(reports).includes('test-only-fixture'),false);
 let key='first',aborted=false;
 const rekeyWorker=createProviderAccounts({BrowserWindow:FakeWindow,apiBase:'https://example.invalid',getToken:()=> 'test-token',getKey:()=>key,canPoll:()=>true,onPrivateStart:()=>{},now:()=>now,
 fetcher:async()=>({ok:true,text:async()=>JSON.stringify({job:makeJob()})}),login:async({signal})=>{key='second';await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));return 'failed';}});
 await rekeyWorker.tick();assert.equal(aborted,true);assert.equal(rekeyWorker.active,false);
 console.log('PASS provider accounts: exact origins, bounded jobs, hidden sandboxed window, fixed email/password steps, challenge refusal, cleanup, private lock and no credential replay/report leakage.');
})().catch(error=>{console.error(error);process.exitCode=1;});
