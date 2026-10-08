// Real Windows Electron processes, real DPAPI, disposable browser profile only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Windows Electron acceptance fixture required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-persistent-protection-'));
const profile=path.join(root,'browser-profile'),fixture=path.join(root,'app');
fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'kuevy-persistent-fixture',version:'1.0.0',main:'main.cjs'}));
const protection=path.resolve('src/persistent-protection.js'),context=path.resolve('src/acceptance-context.js'),controller=path.resolve('src/reset-reuse.js');
fs.writeFileSync(path.join(fixture,'main.cjs'),`
const {app,safeStorage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const p=require(${JSON.stringify(protection)}),ctx=require(${JSON.stringify(context)}),{createResetReuse}=require(${JSON.stringify(controller)});
const home=${JSON.stringify(root)},profile=${JSON.stringify(profile)},receipt='a'.repeat(64);
app.setPath('userData',profile);
app.whenReady().then(async()=>{
 const phase=process.argv.at(-1),saved=path.join(home,'saved.enc'),legacy=path.join(home,'legacy.enc');
 const metadata={schema:1,origin:'https://ssdt-dashboard-fixture-byvenuecreative.vercel.app',environment:'preview',databaseRef:ctx.PROJECT,version:'2.3.31',deploymentSha:'b'.repeat(40),candidateSha:'c'.repeat(40),tree:'d'.repeat(40),metadataVerified:true,expiresAt:Date.now()+3600000};
 if(phase==='prepare'){
  fs.writeFileSync(saved,p.protect('reset-recovery',receipt));
  fs.writeFileSync(legacy,safeStorage.encryptString(receipt));
  const oidc='fixture.'+Buffer.from(JSON.stringify({iss:'https://oidc.vercel.com/byvenuecreative',aud:'https://vercel.com/byvenuecreative',owner:'byvenuecreative',project:'ssdt-dashboard',environment:'development',sub:'owner:byvenuecreative:project:ssdt-dashboard:environment:development',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
  await ctx.enroll(home,safeStorage,metadata,oidc,async()=>new Response(JSON.stringify({environment:'preview',origin:metadata.origin,databaseRef:ctx.PROJECT,deploymentSha:metadata.deploymentSha,version:metadata.version,boundary:2})));
  const contextFile=path.join(home,'.kuevy-acceptance','context.enc');
  fs.writeFileSync(contextFile,safeStorage.encryptString(JSON.stringify({...metadata,oidc})));
  assert.equal(ctx.readContext(home,safeStorage,'2.3.31').oidc,oidc);
  assert.equal(p.isProtected('office-context',fs.readFileSync(contextFile)),true);
  assert.equal(p.unprotect('reset-recovery',fs.readFileSync(legacy),safeStorage),receipt);
 }else{
  safeStorage.encryptString('create-new-browser-key');
  const encrypted=fs.readFileSync(saved);assert.equal(p.unprotect('reset-recovery',encrypted,safeStorage),receipt);
  assert.throws(()=>p.unprotect('office-context',encrypted,safeStorage));
  const changed=Buffer.from(encrypted);changed[changed.length-8]=changed[changed.length-8]===65?66:65;assert.throws(()=>p.unprotect('reset-recovery',changed,safeStorage));
  assert.throws(()=>p.unprotect('reset-recovery',fs.readFileSync(legacy),safeStorage));
  assert.equal(ctx.readContext(home,safeStorage,'2.3.31').databaseRef,ctx.PROJECT);
  const folder=path.join(home,'.kuevy-reset');fs.mkdirSync(folder);const journal=path.join(folder,'state.json');
  fs.writeFileSync(journal,JSON.stringify({manifest_version:1,phase:'ready',device_id:'11111111-1111-4111-8111-111111111111',api_origin:metadata.origin,id:'22222222-2222-4222-8222-222222222222',recovery:encrypted.toString('base64')}));
  let acknowledged=false;
  const reset=createResetReuse({app:{getPath:key=>({home,userData:profile})[key]},safeStorage,getConfig:()=>({}),saveConfig:()=>{},apiBase:metadata.origin,showReady:()=>{},fetcher:async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.action,'complete');assert.equal(body.recovery,receipt);acknowledged=true;return {ok:true,json:async()=>({phase:'complete'})};}});
  await reset.initialise();assert.equal(acknowledged,true);assert.equal(JSON.parse(fs.readFileSync(journal)).recovery,null);
 }
 console.log('PASS Windows Electron persistent protection '+phase);app.quit();
}).catch(()=>{console.error('Windows Electron persistent protection fixture failed');app.exit(1);});
`);
const electron=path.resolve('node_modules/electron/dist/electron.exe');
const fixtureEnvironment={...process.env};delete fixtureEnvironment.ELECTRON_RUN_AS_NODE;
for(const phase of ['prepare','after-cleanup']){
 if(phase==='after-cleanup'){
  assert.ok(path.resolve(profile).startsWith(path.resolve(root)+path.sep));
  fs.rmSync(profile,{recursive:true,force:true});
 }
 const result=spawnSync(electron,[fixture,phase],{windowsHide:true,encoding:'utf8',timeout:60000,env:fixtureEnvironment});
 assert.equal(result.status,0,'Windows Electron fixture '+phase+' failed; raw diagnostics suppressed');
 assert.ok(result.stdout.includes('PASS Windows Electron persistent protection '+phase));
 console.log('PASS Windows Electron '+phase);
}
console.log('PASS receipt acknowledgement and office context survive profile/key deletion; tamper, wrong purpose and lost legacy key refused');
fs.rmSync(root,{recursive:true,force:true});
