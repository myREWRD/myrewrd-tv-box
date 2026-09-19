const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),vm=require('node:vm');
const {createProviderResume,resumePlayback,armResume}=require('../src/provider-resume');
(async()=>{
 const route='https://www.hulu.com/watch/channel-a';let url=route,time=0,provider='hulu',calls=0,result='not-ready';
 const contents=Object.assign(new EventEmitter(),{isDestroyed:()=>false,isLoading:()=>false,getURL:()=>url,
 executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{if(scripts[0].code.includes('function armResume'))return true;calls++;return result;}});
 const controller=createProviderResume({getView:()=>({webContents:contents}),getProvider:()=>provider,canResume:()=>true,now:()=>time});
 controller.request(contents,route);await controller.tick();time+=20000;await controller.tick();assert.equal(calls,2,'media readiness gets time to load');
 result='playing';time+=3000;await controller.tick();result='waiting';time+=3000;await controller.tick();assert.equal(calls,3,'successful resume cannot undo a later pause');
 for(const [event,input] of [['before-input-event',{type:'keyDown'}],['before-mouse-event',{type:'mouseDown'}],['before-mouse-event',{type:'mouseWheel'}]]){
  controller.request(contents,route);contents.emit(event,{},input);await controller.tick();assert.equal(calls,3,'user input cancels restoration');
 }
 controller.request(contents,route);url='https://www.hulu.com/watch/channel-b';await controller.tick();assert.equal(calls,3,'cannot resume a different same-provider route');
 contents.emit('did-navigate-in-page',{},url,true);url=route;await controller.tick();assert.equal(calls,3,'unrelated navigation retires the job');
 controller.request(contents,route);provider='espn';await controller.tick();assert.equal(calls,3);provider='hulu';
 controller.request(contents,route);time+=60001;await controller.tick();assert.equal(calls,3,'bounded lifetime');
 controller.request(contents,route);result='waiting';for(let i=0;i<5;i++){time+=3001;await controller.tick();}assert.equal(calls,6,'bounded play failures');
 assert.equal(contents.listenerCount('before-mouse-event'),1,'no accumulating input listeners');
 let releaseArm;const normalExecute=contents.executeJavaScriptInIsolatedWorld;
 contents.executeJavaScriptInIsolatedWorld=(_world,scripts)=>scripts[0].code.includes('function armResume')?new Promise(resolve=>releaseArm=resolve):normalExecute(_world,scripts);
 controller.request(contents,route);const deferred=controller.tick();contents.emit('before-mouse-event',{}, {type:'mouseDown'});releaseArm(true);await deferred;assert.equal(calls,6,'cancel while arming dispatches no effects');
 controller.request(contents,route);const stalled=controller.tick();const releaseStalled=releaseArm;
 contents.executeJavaScriptInIsolatedWorld=normalExecute;controller.request(contents,route);result='playing';await controller.tick();assert.equal(calls,7,'new job is independent of a stalled old renderer call');releaseStalled(true);await stalled;assert.equal(calls,7);
 let played=0,live=0,sensitive=false,video={isConnected:true,paused:true,ended:false,readyState:0,src:'https://example.test/video',clientWidth:800,clientHeight:450,getBoundingClientRect:()=>({width:800,height:450}),play:async()=>{played++;video.paused=false;}};
 const button={disabled:false,getAttribute:()=> 'Go live',getBoundingClientRect:()=>({width:40,height:20}),click:()=>live++};
 const listeners={};const document={addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:s=>s.startsWith('input')?(sensitive?[{getClientRects:()=>[{}]}]:[]):s==='video'?[video]:[button]};
 const context=vm.createContext({document,location:{origin:'https://www.hulu.com',pathname:'/watch/channel-a'}});
 vm.runInContext(`(${armResume.toString()})('${route}','job',Date.now()+60000)`,context);
 const run=()=>vm.runInContext(`(${resumePlayback.toString()})('${route}','job',Date.now()+60000)`,context);
 assert.equal(await run(),'requested');assert.equal(played,1,'preload-none media can start');assert.equal(live,1);
 sensitive=true;video.paused=true;assert.equal(await run(),'sign-in');assert.equal(played,1);
 sensitive=false;context.location.pathname='/account';assert.equal(await run(),'cancelled');assert.equal(played,1);
 context.location.pathname='/watch/channel-a';listeners.pointerdown({isTrusted:true});assert.equal(await run(),'cancelled');assert.equal(played,1,'queued dispatch respects renderer-side manual input');
 vm.runInContext(`(${armResume.toString()})('${route}','job2',Date.now()+60000)`,context);video.play=()=>new Promise(()=>{});
 assert.equal(vm.runInContext(`(${resumePlayback.toString()})('${route}','job2',Date.now()+60000)`,context),'requested','never-settling play cannot hold the controller');
 console.log('PASS exact-route restore, user cancellation, provider changes, timeout, readiness, retry budget, sign-in and preload-none playback');
})().catch(e=>{console.error(e);process.exitCode=1});
