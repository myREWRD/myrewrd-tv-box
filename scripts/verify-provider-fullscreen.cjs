const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createProviderFullscreen,enterPlayerFullscreen}=require('../src/provider-fullscreen');
(async()=>{
 let url='https://www.espn.com/watch/player/_/id/game',available=true,loading=false,calls=[];
 const hooks={};
 const contents={on:(name,fn)=>hooks[name]=fn,isDestroyed:()=>false,isLoading:()=>loading,getURL:()=>url,executeJavaScriptInIsolatedWorld:async(...args)=>{calls.push(args);return 'fullscreen';}};
 const controller=createProviderFullscreen({getView:()=>({webContents:contents}),getProvider:()=> 'espn',canExpand:()=>available});
 for(const bad of ['https://www.espn.com/watch/','https://auth.hulu.com/oauth2/login','https://www.espn.com/account','https://evil.example/watch/player/_/id/game']){url=bad;await controller.tick();}
 assert.equal(calls.length,0);
 url='https://www.espn.com/watch/player/_/id/game';loading=true;await controller.tick();loading=false;available=false;await controller.tick();available=true;assert.equal(calls.length,0);
 await controller.tick();assert.equal(calls.length,1);assert.equal(calls[0][0],1004);assert.equal(calls[0][2],true);
 url='https://www.espn.com/watch/player/_/id/game/startOption/live';await controller.tick();assert.match(calls.at(-1)[1][0].code,/startOption\/live/);
 hooks['before-input-event']({}, {type:'keyDown',key:'Escape'});await controller.tick();assert.match(calls.at(-1)[1][0].code,/,true\)/);
 hooks['did-navigate']();await controller.tick();assert.match(calls.at(-1)[1][0].code,/,false\)/);
 function fixture(){
  let time=10000,full=0,paused=false,sensitive=false,fail=false,button=null;
  const listeners={};const dispatch=(name,event={})=>(listeners[name]||[]).forEach(fn=>fn({type:name,...event}));
  const document={fullscreenElement:null,addEventListener:(name,fn)=>(listeners[name] ||= []).push(fn)};
  const makeVideo=()=>({get paused(){return paused},ended:false,readyState:4,clientWidth:800,clientHeight:450,getBoundingClientRect:()=>({width:800,height:450}),controls:false,requestFullscreen:async function(){full++;if(fail)throw Error('unsupported');document.fullscreenElement=this;dispatch('fullscreenchange');}});
  let video=makeVideo();
  document.querySelectorAll=selector=>selector.startsWith('input')?(sensitive?[{getClientRects:()=>[{}]}]:[]):selector==='video'?[video]:button?[button]:[];
  const context=vm.createContext({document,location:{origin:'https://www.espn.com',pathname:'/watch/player/_/id/game'},Date:{now:()=>time}});
  const run=()=>vm.runInContext(`(${enterPlayerFullscreen.toString()})('https://www.espn.com/watch/player/_/id/game')`,context);
  return {run,document,dispatch,listeners,context,get video(){return video},get full(){return full},advance:n=>time+=n,replace:()=>video=makeVideo(),pause:v=>paused=v,sensitive:v=>sensitive=v,fail:v=>fail=v,button:v=>button=v,exit:()=>{document.fullscreenElement=null;dispatch('fullscreenchange');}};
 }
 let f=fixture();f.pause(true);assert.equal(await f.run(),'waiting');f.pause(false);f.sensitive(true);assert.equal(await f.run(),'sign-in');f.sensitive(false);
 assert.equal(await f.run(),'fullscreen');assert.equal(f.video.controls,true);
 f.exit();assert.equal(f.video.controls,false);assert.equal(await f.run(),'waiting');f.advance(4001);assert.equal(await f.run(),'fullscreen');assert.equal(f.full,2,'Provider exit recovers');
 f.dispatch('keydown',{isTrusted:true,key:'Escape'});f.exit();f.advance(4001);assert.equal(await f.run(),'dismissed');assert.equal(f.full,2);
 for(const target of [{}, {closest:()=>({getAttribute:()=>null})}]){
  f=fixture();await f.run();f.dispatch('pointerdown',{isTrusted:true,target});f.exit();f.advance(4001);assert.equal(await f.run(),'dismissed','Native/title-only user exit respected');
 }
 f=fixture();f.fail(true);for(let i=0;i<3;i++)assert.equal(await f.run(),'unavailable');assert.equal(await f.run(),'unavailable');assert.equal(f.full,3);
 f=fixture();for(let i=0;i<3;i++){assert.equal(await f.run(),'fullscreen');f.exit();f.replace();f.advance(4001);}
 assert.equal(await f.run(),'cooldown');assert.equal(f.full,3);assert.equal(f.listeners.keydown.length,1);assert.equal(f.listeners.pointerdown.length,1);assert.equal(f.listeners.fullscreenchange.length,1);
 f.advance(60001);assert.equal(await f.run(),'fullscreen','Budget resets after bounded cooldown');
 f=fixture();let clicks=0;f.button({getAttribute:()=> 'Fullscreen',textContent:'',getBoundingClientRect:()=>({width:20,height:20}),click:()=>Promise.resolve().then(()=>{clicks++;f.document.fullscreenElement=f.video;f.dispatch('fullscreenchange');})});
 assert.equal(await f.run(),'requested');await Promise.resolve();assert.equal(await f.run(),'fullscreen');assert.equal(f.full,0);assert.equal(clicks,1);
 f.dispatch('keydown',{isTrusted:true,key:'Escape'});f.exit();assert.equal(await f.run(),'dismissed');
 f.context.location.pathname='/account';assert.equal(await f.run(),'navigation');
 console.log('PASS route/sign-in gating, provider-exit recovery, user keyboard/native-pointer dismissal, page-wide budget, listener lifecycle and async fullscreen');
})().catch(e=>{console.error(e);process.exitCode=1});
