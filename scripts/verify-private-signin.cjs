const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {pathToFileURL}=require('node:url');
function fixture(){
  let now=1000,allowed=true,reply={session:{kind:'provider-sign-in',id:'first',provider:'peacock',lease_ms:8000,offer:{type:'offer',sdp:'v=0'}}};
  const handlers={},windows=[],timers=[];
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;windows.push(this);const wc=new EventEmitter();this.webContents=wc;const profile=new EventEmitter();Object.assign(profile,{setPermissionRequestHandler(){},setPermissionCheckHandler(){}});
      Object.assign(wc,{session:profile,ipc:new EventEmitter(),mainFrame:{url:'',send:(channel,value)=>{this.last={channel,value};}},getURL:()=>wc.mainFrame.url,isDestroyed:()=>!!this.destroyed,setWindowOpenHandler(fn){this.popup=fn;},loadURL:async url=>{wc.mainFrame.url=url;},capturePage:async()=>({resize:()=>({toJPEG:()=>Buffer.from('fixture')})})});
    }
    isDestroyed(){return !!this.destroyed;}destroy(){this.destroyed=true;this.emit('closed');}
    async loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;}
  }
  const context={module:{exports:{}},__dirname:path.join(__dirname,'../src'),Buffer,AbortSignal,setTimeout,clearTimeout,
    setInterval:fn=>{timers.push(fn);return fn;},clearInterval(){},require:name=>name==='node:perf_hooks'?{performance:{now:()=>now}}:name.startsWith('./')?require('../src/'+name.slice(2)):require(name)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/private-signin.js'),'utf8'),context);
  const remote=context.module.exports.createPrivateSignIn({BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers[name]=fn},apiBase:'https://fixture.invalid',getToken:()=> 'fixture',getKey:()=> 'fixture',canStart:()=>allowed,onStart(){},fetcher:async()=>({ok:true,json:async()=>reply})});
  const event=wc=>({sender:wc,senderFrame:wc.mainFrame});
  const ready=()=>{const wc=windows.at(-2).webContents;wc.ipc.emit('tv-signin-ready',event(wc),{documentId:'11111111-1111-4111-8111-111111111111'});};
  return {remote,windows,handlers,timers,event,ready,next:()=>{reply={session:{...reply.session,id:'second'}};},advance:ms=>now+=ms,deny:()=>allowed=false,
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
    f.next();await f.remote.tick();f.ready();f.advance(9000);f.timers.at(-1)();assert.equal(f.remote.active,false,'lease stops without a server response');
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
  const {denyPrivatePermissions}=require('../src/private-permissions');let check,request;
  const profile={setPermissionCheckHandler:f=>check=f,setPermissionRequestHandler:f=>request=f};
  const first={session:profile},second={session:profile};const release1=denyPrivatePermissions(first),release2=denyPrivatePermissions(second);
  assert.equal(check(first,'fullscreen'),false);assert.equal(check({},'media'),false);assert.equal(check({},'mediaKeySystem'),true);
  release1();assert.equal(check(second,'fullscreen'),false);release1();assert.equal(typeof request,'function');release2();assert.equal(check,null);
  console.log('PASS private sign-in: hidden sandbox, IPC identity, stale input, SPA completion, leases, stale captures, shared permission ownership.');
})().catch(error=>{console.error(error);process.exitCode=1;});
