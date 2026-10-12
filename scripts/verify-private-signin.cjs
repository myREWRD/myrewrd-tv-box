const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {pathToFileURL}=require('node:url');
function fixture(provider='peacock',diagnosticThrows=false){
  let now=1000,allowed=true,reply={session:{kind:'provider-sign-in',id:'first',provider,lease_ms:8000,offer:{type:'offer',sdp:'v=0'}}};
  const handlers={},windows=[],timers=[],entryTimers=[],diagnostics=[];let replacement=0;
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;windows.push(this);const wc=new EventEmitter();this.webContents=wc;const profile=new EventEmitter();Object.assign(profile,{setPermissionRequestHandler(){},setPermissionCheckHandler(){}});
      Object.assign(wc,{session:profile,ipc:new EventEmitter(),mainFrame:{url:'',send:(channel,value)=>{this.last={channel,value};}},getURL:()=>wc.mainFrame.url,isDestroyed:()=>!!this.destroyed,setWindowOpenHandler(fn){this.popup=fn;},loadURL:async url=>{wc.mainFrame.url=url;},capturePage:async()=>({resize:()=>({toJPEG:()=>Buffer.from('fixture')})})});
    }
    isDestroyed(){return !!this.destroyed;}destroy(){this.destroyed=true;this.emit('closed');}
    async loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;}
  }
  const context={module:{exports:{}},__dirname:path.join(__dirname,'../src'),Buffer,AbortSignal,
    setTimeout:(fn,ms)=>{if(ms===12000){const timer={fn,cleared:false};entryTimers.push(timer);return timer;}return setTimeout(fn,ms);},
    clearTimeout:timer=>{if(entryTimers.includes(timer))timer.cleared=true;else clearTimeout(timer);},
    setInterval:fn=>{timers.push(fn);return fn;},clearInterval(){},require:name=>name==='node:perf_hooks'?{performance:{now:()=>now}}:name.startsWith('./')?require('../src/'+name.slice(2)):require(name)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/private-signin.js'),'utf8'),context);
  const remote=context.module.exports.createPrivateSignIn({BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers[name]=fn},apiBase:'https://fixture.invalid',getToken:()=> 'fixture',getKey:()=> 'fixture',canStart:()=>allowed,onStart(){},diagnose:record=>{if(diagnosticThrows)throw Error('synthetic write failure');diagnostics.push(JSON.parse(JSON.stringify(record)));},fetcher:async()=>({ok:true,json:async()=>reply})});
  const event=wc=>({sender:wc,senderFrame:wc.mainFrame});
  const ready=()=>{const wc=windows.at(-2).webContents;wc.ipc.emit('tv-signin-ready',event(wc),{documentId:'11111111-1111-4111-8111-111111111111'});};
  return {remote,windows,handlers,timers,entryTimers,diagnostics,event,ready,next:()=>{reply={session:{...reply.session,id:`replacement-${++replacement}`}};},advance:ms=>now+=ms,deny:()=>allowed=false,
    invoke:(name,...args)=>handlers[name](event(windows.at(-1).webContents),...args)};
}
(async()=>{
  const f=fixture();try{
    await f.remote.tick();assert.equal(f.remote.active,true);assert.equal(f.windows.length,2);
    for(const win of f.windows){assert.equal(win.options.show,false);assert.equal(win.options.webPreferences.sandbox,true);assert.equal(win.options.webPreferences.nodeIntegration,false);}
    f.ready();const image=await f.invoke('tv-signin-frame');assert.ok(image.generation);
    assert.equal(await f.handlers['tv-signin-frame']({sender:f.windows[0].webContents,senderFrame:f.windows[0].webContents.mainFrame}),null,'provider cannot invoke transport');
    assert.equal(await f.invoke('tv-signin-input',{seq:1,generation:'stale',command:{type:'text',text:'fixture'}}),false);
    const pending=f.invoke('tv-signin-input',{seq:2,generation:image.generation,command:{type:'text',text:'fixture'}});
    const wc=f.windows[0].webContents,request=f.windows[0].last.value;
    wc.ipc.emit('tv-signin-result',{sender:wc,senderFrame:{url:wc.getURL()}},{id:request.id,documentId:request.documentId,applied:true});
    wc.mainFrame.url='https://www.peacocktv.com/signin';wc.emit('did-navigate-in-page',{},wc.getURL(),true);
    assert.equal(await pending,false,'navigation discards pending input');
    f.advance(250);const second=await f.invoke('tv-signin-frame');assert.notEqual(second.generation,image.generation);
    wc.mainFrame.url='https://www.peacocktv.com/watch/home';wc.emit('did-navigate-in-page',{},wc.getURL(),true);
    assert.equal(f.remote.active,false,'SPA completion closes private windows');assert.ok(f.windows.every(w=>w.destroyed));
    assert.equal(f.diagnostics.at(-1).events.at(-1).reason,'provider_return');
    f.next();await f.remote.tick();f.ready();f.advance(9000);f.timers.at(-1)();assert.equal(f.remote.active,false,'lease stops without a server response');
    assert.equal(f.diagnostics.at(-1).events.at(-1).reason,'lease_expired');
  }finally{f.remote.dispose();}
  for(const reject of [false,true]){
    const f=fixture();try{
      await f.remote.tick();f.ready();let settle;
      f.windows[0].webContents.capturePage=()=>new Promise((resolve,fail)=>settle=reject?fail:resolve);
      const old=f.invoke('tv-signin-frame');f.remote.stop();f.next();await f.remote.tick();f.ready();f.advance(250);
      assert.ok(await f.invoke('tv-signin-frame'),'replacement capture independent of unresolved old capture');
      settle(reject?Error('fixture'):{resize:()=>({toJPEG:()=>Buffer.from('old')})});assert.equal(await old,null);assert.equal(f.remote.active,true,'late old capture cannot stop replacement');
    }finally{f.remote.dispose();}
  }
  for(const applied of [false,true]){
    const f=fixture('prime-video');try{
      await f.remote.tick();f.ready();const wc=f.windows[0].webContents,entry=f.windows[0].last.value;
      assert.equal(f.windows[0].options.webPreferences.disableBlinkFeatures,'WebAuth');assert.equal(f.windows[1].options.webPreferences.disableBlinkFeatures,undefined,'transport stays unchanged');
      assert.equal(entry.command.type,'prime-entry');assert.equal(await f.invoke('tv-signin-frame'),null,'Home cannot be captured');
      assert.equal(await f.invoke('tv-signin-input',{seq:1,generation:'anything',command:{type:'point',x:.5,y:.5}}),false,'Home cannot accept general input');
      wc.ipc.emit('tv-signin-result',f.event(wc),{id:entry.id,documentId:entry.documentId,applied});
      assert.equal(f.remote.active,applied,'failed provider entry closes');
      if(applied){
        wc.mainFrame.url='https://www.amazon.com/ap/signin';wc.emit('did-navigate',{},wc.getURL());f.ready();
        const frame=await f.invoke('tv-signin-frame');assert.ok(frame.generation,'exact Amazon sign-in can be captured');
        wc.mainFrame.url='https://www.amazon.com/ap/mfa';wc.emit('did-navigate',{},wc.getURL());f.ready();f.advance(250);
        const mfaFrame=await f.invoke('tv-signin-frame');assert.ok(mfaFrame.generation);assert.notEqual(mfaFrame.generation,frame.generation,'MFA uses a fresh document generation');
        assert.equal(await f.invoke('tv-signin-input',{seq:1,generation:frame.generation,command:{type:'text',text:'synthetic'}}),false,'old password screen input cannot reach MFA');
        wc.mainFrame.url='https://www.primevideo.com/region/na/';wc.emit('did-navigate',{},wc.getURL());assert.equal(f.remote.active,true,'Home alone is not authentication completion');
        wc.emit('will-redirect',{isMainFrame:true,url:'https://na.primevideo.com/auth/return',preventDefault(){throw Error('approved return blocked');}});
        wc.emit('did-navigate',{},wc.getURL());assert.equal(f.remote.active,false,'observed return then regional Home closes without claiming playback');
      }
    }finally{f.remote.dispose();}
  }
  for(const route of ['https://www.amazon.com/ap/challenge','https://www.amazon.com/ap/forgotpassword','https://attacker.invalid/ap/signin']){
    const f=fixture('prime-video');try{await f.remote.tick();let prevented=false;f.windows[0].webContents.emit('will-redirect',{isMainFrame:true,url:route,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(f.remote.active,false,'unknown challenge/navigation stops');}finally{f.remote.dispose();}
  }
  const stalled=fixture('prime-video');try{await stalled.remote.tick();stalled.ready();stalled.entryTimers[0].fn();assert.equal(stalled.remote.active,false,'no entry navigation stops');assert.ok(stalled.windows.every(w=>w.destroyed));}finally{stalled.remote.dispose();}
  const replaced=fixture('prime-video');try{
    await replaced.remote.tick();replaced.ready();const oldWc=replaced.windows[0].webContents,oldEntry=replaced.windows[0].last.value,oldTimer=replaced.entryTimers[0];
    replaced.remote.stop();replaced.next();await replaced.remote.tick();replaced.ready();
    oldTimer.fn();oldWc.ipc.emit('tv-signin-result',replaced.event(oldWc),{id:oldEntry.id,documentId:oldEntry.documentId,applied:false});assert.equal(replaced.remote.active,true,'old entry callbacks cannot stop replacement');
    const wc=replaced.windows.at(-2).webContents;wc.mainFrame.url='https://www.amazon.com/ap/signin';wc.emit('did-navigate',{},wc.getURL());replaced.ready();const timer=replaced.entryTimers.at(-1);assert.equal(timer.cleared,true);timer.fn();assert.equal(replaced.remote.active,true,'late entry timer cannot stop Amazon sign-in');
  }finally{replaced.remote.dispose();}
  const {denyPrivatePermissions}=require('../src/private-permissions');let check,request;
  const profile={setPermissionCheckHandler:f=>check=f,setPermissionRequestHandler:f=>request=f};
  const first={session:profile},second={session:profile};const release1=denyPrivatePermissions(first),release2=denyPrivatePermissions(second);
  assert.equal(check(first,'fullscreen'),false);assert.equal(check({},'media'),false);assert.equal(check({},'mediaKeySystem'),true);
  release1();assert.equal(check(second,'fullscreen'),false);release1();assert.equal(typeof request,'function');release2();assert.equal(check,null);
  for(const [event,reason,index] of [['will-redirect','navigation_denied',0],['render-process-gone','provider_renderer_gone',0],['render-process-gone','transport_renderer_gone',1]]){
    const d=fixture();try{
      await d.remote.tick();d.windows[index].webContents.emit(event,{isMainFrame:true,url:'https://unapproved.invalid/private-secret-marker',preventDefault(){}},{reason:'private-secret-marker'});
      assert.equal(d.remote.active,false);assert.equal(d.diagnostics.at(-1).events.at(-1).reason,reason);
      assert.equal(JSON.stringify(d.diagnostics).includes('private-secret-marker'),false);
      for(const record of d.diagnostics)for(const e of record.events)assert.deepEqual(Object.keys(e).sort(),['at','reason']);
    }finally{d.remote.dispose();}
  }
  const bounded=fixture();try{
    for(let i=0;i<12;i++){bounded.next();await bounded.remote.tick();bounded.remote.stop();}
    assert.equal(bounded.diagnostics.at(-1).events.length,16,'fixed diagnostic history is bounded');
    const before=bounded.diagnostics.length;bounded.next();await bounded.remote.tick();bounded.remote.stop('private-secret-marker');
    assert.equal(bounded.diagnostics.length,before+1,'unrecognized diagnostic values are discarded');
  }finally{bounded.remote.dispose();}
  const unwritable=fixture('hulu',true);try{await unwritable.remote.tick();assert.equal(unwritable.remote.active,true,'diagnostic write failure cannot stop authentication');unwritable.remote.stop();assert.equal(unwritable.remote.active,false);}finally{unwritable.remote.dispose();}
  console.log('PASS private sign-in: hidden sandbox, IPC identity, stale input, SPA completion, leases, stale captures, shared permission ownership.');
})().catch(error=>{console.error(error);process.exitCode=1;});
