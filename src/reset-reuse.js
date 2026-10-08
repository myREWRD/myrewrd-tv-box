const fs = require('node:fs');
const path = require('node:path');
const {spawn,execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {assertPlainTree} = require('./installed-runtime');
const {launchResetHelper} = require('./reset-helper-launch');
const protection = require('./persistent-protection');
const LEGACY = 'This legacy TV uses a shared or unverified credential and cannot be automatically reset for reuse. Complete decommissioning from the KUEVY TV Devices page.';
function read(file) { if (!fs.existsSync(file)) return null; return JSON.parse(fs.readFileSync(file,'utf8')); }
function createResetReuse({app,dialog,safeStorage,getConfig,saveConfig,apiBase,isUpdating,showReady,restoreActive=()=>{},runPreflight=null,launch=spawn,fetcher=(...args)=>fetch(...args)}) {
 const home=app.getPath('home'), profile=app.getPath('userData'), root=path.join(home,'myREWRD-TV-Box');
 const directory=path.join(home,'.kuevy-reset'), journalPath=path.join(directory,'state.json');
 let busy=false;
 function plain(target) {
  const full=path.resolve(target), boundary=path.resolve(home)+path.sep;
  if(!full.toLowerCase().startsWith(boundary.toLowerCase())) throw Error('Cleanup outside dedicated profile denied');
  let cursor=full;
  while(cursor!==path.dirname(cursor)) {if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink()) throw Error('Redirected profile denied');cursor=path.dirname(cursor);}
  if(fs.existsSync(full)&&fs.lstatSync(full).isDirectory()) assertPlainTree(full);
 }
 function journal() { plain(directory); const value=read(journalPath);if(value && (value.api_origin || 'https://app.myrewrd.com')!==apiBase)throw Error('Reset environment mismatch');return value; }
 function isReadyOffline() {try {plain(directory);const value=read(journalPath);return value?.manifest_version===1 && value.phase==='ready' && !getConfig().tvToken;}catch{return false;}}
 function write(value) { value.api_origin=apiBase;plain(directory);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(journalPath+'.tmp',JSON.stringify(value));fs.renameSync(journalPath+'.tmp',journalPath); }
 function secret() {
  if (!safeStorage.isEncryptionAvailable()) throw Error('Windows credential protection unavailable. Reset stopped.');
  const file=path.join(profile,'reset-key.enc'), config=getConfig();
  if(config.resetKey) {
   if(!/^[a-f0-9]{64}$/.test(config.resetKey)) throw Error(LEGACY);
   plain(profile);plain(root);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(file,safeStorage.encryptString(config.resetKey));
   delete config.resetKey;saveConfig({...config,resetKey:undefined});
   const fallback=path.join(root,'config.json');
   if(fs.existsSync(fallback)) {const value=read(fallback);if(value.deviceId!==config.deviceId||value.tvToken!==config.tvToken) throw Error('Conflicting local pairing');delete value.resetKey;fs.writeFileSync(fallback,JSON.stringify(value));}
  }
  return fs.existsSync(file) ? safeStorage.decryptString(fs.readFileSync(file)) : null;
 }
 async function request(action,operation=null) {
  const config=getConfig();
  const recovery=operation?.recovery ? protection.unprotect('reset-recovery',Buffer.from(operation.recovery,'base64'),safeStorage) : undefined;
  const key=operation ? undefined : secret();
  if(!operation && (!config.deviceId || !config.tvToken || !key)) throw Error(LEGACY);
  const response=await fetcher(`${apiBase}/api/tv-reset`,{method:'POST',headers:{'Content-Type':'application/json',...(!operation?{Authorization:`Bearer ${config.tvToken}`}:{})},
   body:JSON.stringify({action,device_id:config.deviceId,key,id:operation?.id,recovery}),signal:AbortSignal.timeout(15000)});
  const value=await response.json();if(!response.ok) throw Error(value.error || 'Reset could not be verified.');return value;
 }
 function preflight(operation=null,readyRecovery=false) {
  if(process.platform!=='win32') throw Error('Reset for reuse requires Windows.');
  if(isUpdating()) throw Error('Wait for the TV update to finish before resetting.');
  for(const target of [root,profile,directory,path.join(app.getPath('appData'),'myREWRD TV Box'),path.join(app.getPath('appData'),'myrewrd-tv-box')]) plain(target);
  const config=getConfig();let matched=false;
  for(const folder of [root,profile,path.join(root,'runtime-a'),path.join(root,'runtime-b'),path.join(app.getPath('appData'),'myREWRD TV Box'),path.join(app.getPath('appData'),'myrewrd-tv-box')]) {
   if(readyRecovery && ['reset-key.enc','presentation-key.enc','presentation-key.json'].some(name=>fs.existsSync(path.join(folder,name))))throw Error('Ready recovery requires cleared local keys.');
   if(readyRecovery && fs.existsSync(path.join(folder,'config.json')))throw Error('Ready recovery requires cleared local pairing.');
   const value=read(path.join(folder,'config.json'));
   if(!value)continue;
   if(readyRecovery)throw Error('Ready recovery requires cleared local pairing.');
   if((value.apiOrigin || 'https://app.myrewrd.com')!==apiBase)throw Error('Local installation environment mismatch');
   if(operation) {
    const tokenHash=createHash('sha256').update(value.tvToken || '').digest('hex');
    if(tokenHash!==operation.token_hash || (value.deviceId && value.deviceId!==operation.device_id) || value.venueId!==operation.venue_id)throw Error('Conflicting local pairing. Attended review required.');
    matched=true;
   } else if(value.deviceId!==config.deviceId || value.tvToken!==config.tvToken || value.venueId!==config.venueId)throw Error('Conflicting local pairing. Dashboard-assisted cleanup required.');
  }
  if(operation && !matched && !readyRecovery)throw Error('No matching local identity; verify recovery at the office instead.');
  if(runPreflight)runPreflight();
  else execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'assert-reset-idle.ps1'),'-ParentPid',String(process.pid)],{windowsHide:true,timeout:15000,stdio:'pipe'});
 }
 async function cleanup() {

  showReady('Reset incomplete — finishing local KUEVY cleanup');

  const operation=journal(); if(operation.phase!=='retired') throw Error('Server retirement is not verified.');
  // Upgrade legacy recovery before any browser profile/key is erased.
  if(operation.recovery && !protection.isProtected('reset-recovery',Buffer.from(operation.recovery,'base64'))){operation.recovery=protection.protect('reset-recovery',protection.unprotect('reset-recovery',Buffer.from(operation.recovery,'base64'),safeStorage)).toString('base64');write(operation);}

  const helper=path.join(directory,'cleanup.ps1');

  const bundled=path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'reset-cleanup.ps1');

  fs.copyFileSync(bundled,helper);

  fs.copyFileSync(path.join(path.dirname(bundled),'assert-reset-idle.ps1'),path.join(directory,'assert-reset-idle.ps1'));
  fs.copyFileSync(path.join(path.dirname(bundled),'reset-owned-copies.ps1'),path.join(directory,'reset-owned-copies.ps1'));
  plain(directory);
  await launchResetHelper({helper:path.join(path.dirname(bundled),'maintenance-launcher.exe'),journal:journalPath,executable:app.getPath('exe'),launch,plain});
  app.quit();

 }
 async function initialise() {
  const operation=journal();if(operation && operation.manifest_version!==1)throw Error('Reset journal version is unsupported');if(!operation){secret();return false;}
  if(operation.phase==='ready') {
   try {if(operation.recovery){await request('complete',operation);operation.recovery=null;write(operation);}} catch { /* Local Ready works offline; scoped acknowledgement retries later. */ }
   if(getConfig().deviceId && getConfig().deviceId!==operation.device_id) {
    secret();await request('identity');fs.unlinkSync(journalPath);return false;
   }
   showReady('Ready to Provision');return true;
  }
  showReady('Reset incomplete — use Ctrl+Alt+R to resume');return true;
 }
 async function reset() {
  if(busy) return;busy=true;
  try {
   let operation=journal();
   if(operation?.phase==='ready') {showReady('Ready to Provision');return;}
   if(operation) {
    const status=await request('status',operation);
    if(status.phase==='retired'||status.phase==='complete') {operation.phase='retired';write(operation);await cleanup();return;}
   } else {
    preflight();const prepared=await request('prepare');
    operation={manifest_version:1,id:prepared.id,device_id:prepared.device_id,venue_name:prepared.venue_name,device_name:prepared.device_name,phase:'prepared',recovery:protection.protect('reset-recovery',prepared.recovery).toString('base64')};write(operation);
   }
   const answer=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Confirm Reset'],defaultId:0,cancelId:0,
    title:'Reset KUEVY TV for reuse',message:`Reset ${operation.device_name} from ${operation.venue_name}?`,detail:'This removes this TV from its venue, revokes this installation’s access and prepares it for another venue. Windows will not be erased.'});
   if(answer.response!==1) {const cancelled=await request('cancel',operation);if(cancelled.cancelled){fs.unlinkSync(journalPath);restoreActive();}else{operation.phase='retired';write(operation);showReady('Reset incomplete — use Ctrl+Alt+R to resume');}return;}
   preflight();operation.phase='committing';write(operation);showReady('Reset incomplete — verifying server retirement');await request('commit',operation);operation.phase='retired';write(operation);await cleanup();
  } catch(error) { await dialog.showMessageBox({type:'error',message:'Reset did not complete',detail:error.message}); }
  finally {busy=false;}
 }
 async function assisted() {
  if(busy)return;busy=true;
  try {
   const chosen=await dialog.showOpenDialog({title:'Select dashboard-authorized KUEVY cleanup receipt',properties:['openFile'],filters:[{name:'KUEVY cleanup receipt',extensions:['json']}]});
   if(chosen.canceled)return;
   const file=chosen.filePaths[0];plain(file);
   const receipt=read(file);
   if(!receipt || !/^[a-f0-9]{64}$/.test(receipt.recovery || ''))throw Error('Invalid cleanup receipt');
   const operation={manifest_version:1,id:receipt.id,device_id:receipt.device_id,recovery:protection.protect('reset-recovery',receipt.recovery).toString('base64')};
   const verified=await request('status',operation);
   if(!['retired','complete'].includes(verified.phase)||verified.device_id!==operation.device_id||!verified.token_hash)throw Error('Server retirement required');
   operation.phase='retired';operation.token_hash=verified.token_hash;operation.venue_id=verified.venue_id;
   operation.device_name=verified.device_name;operation.venue_name=verified.venue_name;
   const previous=journal();
   const readyRecovery=previous?.manifest_version===1 && previous.phase==='ready' && previous.device_id===operation.device_id && !getConfig().deviceId && !getConfig().tvToken && !getConfig().resetKey;
   preflight(operation,readyRecovery);
   const answer=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Confirm cleanup'],defaultId:0,cancelId:0,title:'Reset KUEVY TV for reuse',message:`Clean up retired ${operation.device_name} from ${operation.venue_name}?`,detail:'The server has retired this installation. Remove only its verified local KUEVY state. Windows will not be erased.'});
   if(answer.response!==1)return;
   preflight(operation,readyRecovery);
   if(readyRecovery){
    const current=journal();
    if(current?.manifest_version!==1 || current.phase!=='ready' || current.device_id!==operation.device_id || getConfig().deviceId || getConfig().tvToken || getConfig().resetKey)throw Error('Ready recovery state changed.');
    const status=await request('status',operation);
    if(!['retired','complete'].includes(status.phase) || status.device_id!==operation.device_id || status.token_hash!==operation.token_hash || status.venue_id!==operation.venue_id)throw Error('Server retirement changed.');
    preflight(operation,true);await request('complete',operation);operation.phase='ready';operation.recovery=null;write(operation);fs.unlinkSync(file);showReady('Ready to Provision');
   }
   else{write(operation);fs.unlinkSync(file);await cleanup();}
  } catch(error){await dialog.showMessageBox({type:'error',message:'Cleanup did not complete',detail:error.message});}
  finally{busy=false;}
 }
 return {initialise,reset,assisted,request,isReadyOffline};
}
module.exports={createResetReuse,LEGACY};
