const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {createResetReuse}=require('../src/reset-reuse');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-reset-controller-'));
const uuid='11111111-1111-4111-8111-111111111111',venue='22222222-2222-4222-8222-222222222222';
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('fixture-cipher:'+s),decryptString:b=>b.toString().replace(/^fixture-cipher:/,'')};
function fixture(name,options={}) {
 const home=path.join(base,name),appData=path.join(home,'Roaming'),profile=path.join(appData,'myREWRD TV Box'),root=path.join(home,'myREWRD-TV-Box');
 fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(root,{recursive:true});
 let config={deviceId:uuid,venueId:venue,tvToken:'fixture-old-token',resetKey:'a'.repeat(64)},server='prepared',launched=0,quit=0,restored=0;
 const ready=[],errors=[],calls=[];
 fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config));
 const journal=path.join(home,'.kuevy-reset','state.json');
 const app={getPath:key=>({home,appData,userData:profile,exe:path.join(root,'runtime-a','myREWRD TV Box.exe')})[key],quit:()=>quit++};
 const dialog={showMessageBox:async value=>{if(value.type==='error'){errors.push(value.detail);return {response:0};}return {response:options.cancel?0:1};}};
 const controller=createResetReuse({app,dialog,safeStorage,getConfig:()=>config,saveConfig:value=>{config={...value};fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify(config));},apiBase:'https://fixture.invalid',isUpdating:()=>Boolean(options.updating),runPreflight:()=>{},restoreActive:()=>restored++,showReady:value=>ready.push(value),launch:()=>{launched++;const child=new EventEmitter();child.unref=()=>{};setImmediate(()=>child.emit('spawn'));return child;}});
 global.fetch=async (_url,request)=>{
  const body=JSON.parse(request.body);calls.push(body.action);
  if(options.offline)throw Error('Fixture offline');
  if(body.action==='prepare')return {ok:!options.shared,json:async()=>options.shared?{error:'Shared or unverified credential'}:{id:uuid,device_id:uuid,device_name:'Fixture box',venue_name:'Fixture venue',recovery:'b'.repeat(64)}};
  if(body.action==='commit'){server='retired';if(options.lost){options.lost=false;throw Error('Fixture lost response');}}
  if(body.action==='identity' && options.badIdentity)return {ok:false,json:async()=>({error:'Installation identity unavailable'})};
  return {ok:true,json:async()=>body.action==='cancel'?{cancelled:true}: {phase:server,valid:true}};
 };
 return {controller,home,profile,root,journal,ready,errors,calls,options,get launched(){return launched;},get quit(){return quit;},get restored(){return restored;},setConfig:value=>config=value};
}
(async()=>{
 for(const kind of ['success','cancel','offline','shared','updating','lost','conflict','redirect','ready','fresh']) {
  const f=fixture(kind,{cancel:kind==='cancel',offline:kind==='offline',shared:kind==='shared',updating:kind==='updating',lost:kind==='lost'});
  await f.controller.initialise();
  assert.ok(!fs.readFileSync(path.join(f.root,'config.json'),'utf8').includes('resetKey'));
  assert.ok(!fs.readFileSync(path.join(f.profile,'config.json'),'utf8').includes('resetKey'));
  if(kind==='conflict'){fs.mkdirSync(path.join(f.root,'runtime-b'),{recursive:true});fs.writeFileSync(path.join(f.root,'runtime-b','config.json'),JSON.stringify({deviceId:venue}));}
  if(kind==='redirect'){fs.mkdirSync(path.join(base,'unrelated'),{recursive:true});fs.symlinkSync(path.join(base,'unrelated'),path.join(f.root,'redirect'),'junction');}
  if(['ready','fresh'].includes(kind)){
   fs.mkdirSync(path.dirname(f.journal),{recursive:true});fs.writeFileSync(f.journal,JSON.stringify({manifest_version:1,phase:'ready',device_id:uuid}));
   f.setConfig(kind==='fresh'?{deviceId:venue,tvToken:'fixture-new-token',venueId:venue,resetKey:'c'.repeat(64)}:{});
   if(kind==='fresh'){fs.unlinkSync(path.join(f.root,'config.json'));await f.controller.initialise();assert.equal(fs.existsSync(f.journal),false);}
   else{f.options.offline=true;await f.controller.initialise();assert.equal(f.ready.at(-1),'Ready to Provision');}
  } else {
   await f.controller.reset();await new Promise(resolve=>setImmediate(resolve));
   if(kind==='success'){assert.equal(f.launched,1);assert.equal(f.quit,1);assert.equal(JSON.parse(fs.readFileSync(f.journal)).phase,'retired');}
   else if(kind==='cancel'){assert.equal(fs.existsSync(f.journal),false);assert.equal(f.restored,1);assert.ok(!f.calls.includes('commit'));}
   else if(kind==='lost'){assert.equal(JSON.parse(fs.readFileSync(f.journal)).phase,'committing');assert.match(f.ready.at(-1),/Reset incomplete/);await f.controller.initialise();await f.controller.reset();assert.equal(f.launched,1);}
   else{assert.equal(f.launched,0);assert.ok(f.errors.length);assert.ok(!f.calls.includes('commit'));assert.ok(fs.existsSync(path.join(f.root,'config.json')));}
  }
  console.log('PASS reset controller '+kind);
 }
 // No remote renderer IPC/reset channel is exposed. Only native shortcut/dialog.
 const main=fs.readFileSync('src/main.js','utf8');
 assert.ok(main.includes('Control+Alt+R'));assert.ok(!/ipcMain\.(?:on|handle)\([^\n]*resetReuse/.test(main));
})().catch(error=>{console.error(error);process.exitCode=1;});
