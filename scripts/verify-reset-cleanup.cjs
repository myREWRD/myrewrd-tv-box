const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Windows cleanup verification requires Windows');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-cleanup-fixture-'));
const id='11111111-1111-4111-8111-111111111111';
const source=fs.readFileSync('src/reset-cleanup.ps1','utf8').replace(/^param[^\n]*\r?\n/,'');
for(const kind of ['success','partial','resume','conflict','slot-conflict','redirect','process','outside','startup-failure']) {
 const home=path.join(base,kind),root=path.join(home,'myREWRD-TV-Box'),profile=path.join(home,'Roaming','myREWRD TV Box'),journal=path.join(home,'.kuevy-reset','state.json'),exe=path.join(root,'runtime-a','myREWRD TV Box.exe');
 for(const folder of [root,profile,path.dirname(journal),path.dirname(exe)])fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(exe,'immutable-fixture');fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({deviceId:id}));
 fs.writeFileSync(path.join(profile,'Cookies'),'old-venue-fixture');
 const chrome=path.join(home,'Local','Google','Chrome','User Data','Cookies');fs.mkdirSync(path.dirname(chrome),{recursive:true});fs.writeFileSync(chrome,'preserve');
 const support=path.join(home,'remote-support-fixture');fs.writeFileSync(support,'preserve');
 fs.writeFileSync(journal,JSON.stringify({manifest_version:1,phase:'retired',device_id:id}));
 fs.writeFileSync(path.join(path.dirname(journal),'assert-reset-idle.ps1'),'# fixture only; no registry/system inspection');
 fs.copyFileSync('src/reset-owned-copies.ps1',path.join(path.dirname(journal),'reset-owned-copies.ps1'));
 if(kind==='conflict')fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({deviceId:'other'}));
 if(kind==='slot-conflict')fs.writeFileSync(path.join(root,'runtime-a','config.json'),JSON.stringify({deviceId:'other'}));
 if(kind==='redirect')fs.symlinkSync(path.dirname(chrome),path.join(profile,'redirect'),'junction');
 if(kind==='resume')fs.rmSync(profile,{recursive:true});
 const harness=`$Journal=$env:FIXTURE_JOURNAL;$ParentPid=999999;$Executable=$env:FIXTURE_EXE
 function Get-Process {return $null}
 function Get-CimInstance {if($env:FIXTURE_CASE -eq 'process'){return @{ExecutablePath=(Join-Path $env:USERPROFILE 'myREWRD-TV-Box\\update-supervisor.exe')}};return @()}
 function Start-Process {param($FilePath,$WindowStyle)}
 function Remove-Item {param($LiteralPath,[switch]$Recurse,[switch]$Force);if($env:FIXTURE_CASE -eq 'partial' -and $LiteralPath -match 'config.json$'){throw 'Fixture interruption'};Microsoft.PowerShell.Management\\Remove-Item -LiteralPath $LiteralPath -Recurse:$Recurse -Force:$Force}
 ${source}`;
 const file=path.join(home,'harness.ps1');fs.writeFileSync(file,harness);
 const startup=path.join(home,'Roaming','Microsoft','Windows','Start Menu','Programs','Startup');
 if(kind==='startup-failure'){fs.mkdirSync(path.dirname(startup),{recursive:true});fs.writeFileSync(startup,'block-ready-launcher');}
 const env={...process.env,USERPROFILE:home,APPDATA:path.join(home,'Roaming'),FIXTURE_JOURNAL:journal,FIXTURE_EXE:kind==='outside'?path.join(base,'outside.exe'):exe,FIXTURE_CASE:kind};
 const result=spawnSync('powershell.exe',['-NoProfile','-File',file],{env,windowsHide:true,encoding:'utf8',timeout:20000});
 const state=JSON.parse(fs.readFileSync(journal,'utf8'));
 if(['success','resume'].includes(kind)){
  assert.equal(result.status,0,result.stderr);assert.equal(state.phase,'ready');assert.equal(fs.existsSync(path.join(root,'config.json')),false);assert.equal(fs.existsSync(profile),false);assert.ok(fs.existsSync(path.join(startup,'myREWRD-TV-Box.bat')));
 }else{assert.equal(result.status,1,kind+' accepted');assert.equal(state.phase,'retired');}
 assert.equal(fs.readFileSync(chrome,'utf8'),'preserve');assert.equal(fs.readFileSync(support,'utf8'),'preserve');assert.equal(fs.readFileSync(exe,'utf8'),'immutable-fixture');
 console.log('PASS Windows cleanup '+kind);
}
