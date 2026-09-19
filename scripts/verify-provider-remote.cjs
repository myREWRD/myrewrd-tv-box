const assert = require('node:assert/strict');
const { applyRemoteCommand, createProviderRemote, providerPage } = require('../src/provider-remote');
const events = [], opened = [];
let available = true, url = 'https://tv.youtube.com/', loading = false, muted = false;
const view = { getBounds: () => ({ width: 1920, height: 1015 }), webContents: {
  isDestroyed: () => false, getURL: () => url, isLoading: () => loading, focus() {},
  sendInputEvent: event => events.push(event), executeJavaScriptInIsolatedWorld: async () => {},
  navigationHistory: { canGoBack: () => true, goBack: () => events.push('back') },
  reload: () => events.push('reload'), setAudioMuted: value => {muted=value;events.push(value);}, isAudioMuted:()=>muted,
} };
const context = { getView: () => view, canControl: () => available, openProvider: async value => opened.push(value), focus() {} };
const apply = command => applyRemoteCommand(command,context);
(async () => {
  for (const bad of ['file:///C:/Windows', 'https://app.myrewrd.com/tv/example', 'https://accounts.google.com/', 'http://tv.youtube.com/', 'https://hulu.com.evil.invalid/', 'https://user:password@hulu.com/', 'https://hulu.com:444/']) assert.equal(providerPage(bad),false);
  assert.equal(await apply({ type:'provider',provider:'youtube' }),'applied'); assert.equal(opened[0],'https://tv.youtube.com/');
  assert.equal(await apply({ type:'provider',provider:'__proto__' }),'unavailable');
  assert.equal(await apply({ type:'key',key:'Control+L' }),'unavailable'); assert.equal(events.length,0);
  await apply({ type:'key',key:'ShiftTab' }); assert.deepEqual(events.splice(0),[{ type:'keyDown',keyCode:'Tab',modifiers:['shift'] },{ type:'keyUp',keyCode:'Tab',modifiers:['shift'] }]);
  await apply({ type:'point',x:1,y:1,click:true });
  assert.deepEqual(events.map(e=>[e.type,e.x,e.y]),[['mouseMove',1919,1014],['mouseDown',1919,1014],['mouseUp',1919,1014]]); events.length=0;
  for (const c of [{type:'point',x:NaN,y:0,click:true},{type:'point',x:0,y:Infinity,click:true},{type:'point',x:0,y:0,click:'yes'},{type:'text',text:'password'}]) assert.equal(await apply(c),'unavailable');
  for (const c of [{type:'key',key:'Return'},{type:'point',x:0,y:0,click:true},{type:'provider',provider:'hulu'}]) { available=false; assert.equal(await apply(c),'unavailable'); available=true; }
  url='https://accounts.google.com/'; assert.equal(await apply({type:'key',key:'Return'}),'unavailable'); url='https://tv.youtube.com/';
  loading=true; assert.equal(await apply({type:'point',x:0,y:0,click:true}),'unavailable'); loading=false;
  const prior = view.webContents.executeJavaScriptInIsolatedWorld;
  view.webContents.executeJavaScriptInIsolatedWorld=async()=>{available=false;};
  assert.equal(await apply({type:'point',x:0,y:0,click:true}),'unavailable'); assert.equal(events.filter(e=>e.type==='mouseDown').length,0);
  available=true;view.webContents.executeJavaScriptInIsolatedWorld=prior;
  events.length=0;
  let mediaCode;
  view.webContents.executeJavaScriptInIsolatedWorld=async(world,scripts,gesture)=>{assert.equal(world,1003);assert.equal(gesture,true);mediaCode=scripts[0].code;return true;};
  assert.equal(await apply({type:'mute',muted:false}),'applied');
  assert.match(mediaCode,/const muted = false/);assert.deepEqual(events.splice(0),[false]);
  assert.equal(await apply({type:'mute',muted:true}),'applied');
  assert.match(mediaCode,/const muted = true/);assert.deepEqual(events.splice(0),[true,true]);
  assert.equal(await apply({type:'mute',muted:'false'}),'unavailable');assert.equal(events.length,0);
  view.webContents.executeJavaScriptInIsolatedWorld=async()=>{available=false;};
  assert.equal(await apply({type:'mute',muted:false}),'unavailable');assert.equal(events.length,0,'revoked operation cannot unmute output');available=true;
  view.webContents.executeJavaScriptInIsolatedWorld=async()=>{url='https://www.hulu.com/watch/changed';};
  assert.equal(await apply({type:'mute',muted:false}),'unavailable');assert.equal(events.length,0,'navigation cannot unmute replacement page');url='https://tv.youtube.com/';
  view.webContents.executeJavaScriptInIsolatedWorld=async()=>{throw Error('renderer unavailable');};
  assert.equal(await apply({type:'mute',muted:false}),'unavailable');assert.equal(events.length,0);
  view.webContents.executeJavaScriptInIsolatedWorld=async()=>false;
  assert.equal(await apply({type:'mute',muted:false}),'unavailable');assert.equal(events.length,0,'missing media cannot claim unmute success');
  for(const volume of [-1,101,NaN,0.5,'50'])assert.equal(await apply({type:'volume',volume}),'unavailable');
  view.webContents.executeJavaScriptInIsolatedWorld=prior;

  let polls=0, applied=0, reports=[], resolve, clock=1000;
  const envelope={command_id:'11111111-1111-4111-8111-111111111111',command:{type:'key',key:'Return'},expires_at:new Date(5000).toISOString()};
  const worker=createProviderRemote({apiBase:'https://fixture.invalid',getToken:()=> 'fixture-token',getKey:()=> 'fixture-key',canPoll:()=>available,now:()=>clock,
    apply:async()=>{applied++;return 'applied';},fetcher:async(_url,options)=>{
      const body=JSON.parse(options.body);if(body.action==='report'){reports.push(body);return {ok:true};}
      polls++;return new Promise(r=>{resolve=r;});
    }});
  const pending=worker.tick(); await worker.tick(); assert.equal(polls,1,'no overlapping polls');
  worker.stop();resolve({ok:true,json:async()=>({command:envelope})});await pending;assert.equal(applied,0,'late response after suspend ignored');
  await worker.tick(); assert.equal(polls,1,'suspend remains stopped until resume'); worker.resume();
  const expired=worker.tick(); clock=6000;resolve({ok:true,json:async()=>({command:envelope})});await expired;worker.stop();
  assert.equal(applied,0);assert.equal(reports[0].result,'expired');
  clock=1000;worker.resume();const valid=worker.tick();resolve({ok:true,json:async()=>({command:envelope})});await valid;worker.stop();assert.equal(applied,1);assert.equal(reports[1].result,'applied');
  console.log('PASS provider input scope, fixed providers, bounded pointer, key allowlist, navigation/loading races, poll overlap, suspend cancellation and expiry');
})().catch(error=>{console.error(error);process.exitCode=1;});
