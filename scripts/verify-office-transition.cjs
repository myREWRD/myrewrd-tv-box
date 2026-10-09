const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Windows fixture required');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-office-transition-'));
const source=fs.readFileSync(path.join(__dirname,'finish-office-acceptance.ps1'),'utf8');
for(const kind of ['success','resume','active','unacknowledged','production','pairing','key','process','cancel','redirect','prompt-pairing','prompt-state']){
 const home=path.join(base,kind),reset=path.join(home,'.kuevy-reset'),context=path.join(home,'.kuevy-acceptance'),root=path.join(home,'myREWRD-TV-Box'),profile=path.join(home,'Roaming','myREWRD TV Box');
 for(const folder of [reset,context,root,profile])fs.mkdirSync(folder,{recursive:true});
 const origin='https://ssdt-dashboard-fixture-byvenuecreative.vercel.app';
 const state={manifest_version:1,phase:kind==='active'?'retired':'ready',device_id:'11111111-1111-4111-8111-111111111111',api_origin:origin,recovery:kind==='unacknowledged'?'encrypted-fixture':null};
 fs.writeFileSync(path.join(reset,kind==='resume'?'office-complete.json':'state.json'),JSON.stringify(state));
 fs.writeFileSync(path.join(context,'enrolled.json'),JSON.stringify({schema:1,environment:'preview',databaseRef:kind==='production'?'production':'rwcpejpazuomogzvbwfy',origin}));
 fs.writeFileSync(path.join(context,'context.enc'),'encrypted-fixture');
 fs.writeFileSync(path.join(reset,'assert-reset-idle.ps1'),'# isolated no-op fixture');
 const support=path.join(home,'remote-support-fixture');fs.writeFileSync(support,'preserve');
 const network=path.join(home,'network-fixture');fs.writeFileSync(network,'preserve');
 if(kind==='pairing')fs.writeFileSync(path.join(root,'config.json'),'fresh-or-stale-identity');
 if(kind==='key')fs.writeFileSync(path.join(profile,'reset-key.enc'),'fresh-or-stale-key');
 if(kind==='redirect')fs.symlinkSync(root,path.join(profile,'redirect'),'junction');
 const file=path.join(home,'harness.ps1');fs.writeFileSync(file,`function Read-Host {
 if($env:FIXTURE_CASE -eq 'cancel'){return 'Cancel'}
 if($env:FIXTURE_CASE -eq 'prompt-pairing'){[IO.File]::WriteAllText((Join-Path $env:USERPROFILE 'myREWRD-TV-Box\\config.json'),'fresh-pairing')}
 if($env:FIXTURE_CASE -eq 'prompt-state'){$file=Join-Path $env:USERPROFILE '.kuevy-reset\\state.json';$state=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json;$state.phase='retired';[IO.File]::WriteAllText($file,($state|ConvertTo-Json))}
 return 'FINISH OFFICE TEST'
 }\nfunction Get-CimInstance {if($env:FIXTURE_CASE -eq 'process'){return @{ExecutablePath=(Join-Path $env:USERPROFILE 'myREWRD-TV-Box\\update-supervisor.exe')}};return @()}\n${source}`);
 const result=spawnSync('powershell.exe',['-NoProfile','-File',file],{windowsHide:true,encoding:'utf8',timeout:20000,env:{...process.env,USERPROFILE:home,APPDATA:path.join(home,'Roaming'),FIXTURE_CASE:kind}});
 if(['success','resume'].includes(kind)){
  assert.equal(result.status,0,result.stderr);assert.equal(fs.existsSync(path.join(context,'enrolled.json')),false);assert.equal(fs.existsSync(path.join(context,'context.enc')),false);assert.equal(fs.existsSync(path.join(reset,'state.json')),false);assert.equal(fs.existsSync(profile),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reset,'office-complete.json'),'utf8')),state);
 }else{
  assert.equal(result.status,1,kind+' must refuse');assert.equal(fs.readFileSync(path.join(context,'context.enc'),'utf8'),'encrypted-fixture');assert.ok(fs.existsSync(path.join(context,'enrolled.json')));
 }
 assert.equal(fs.readFileSync(support,'utf8'),'preserve');assert.equal(fs.readFileSync(network,'utf8'),'preserve');console.log('PASS attended office transition '+kind);
}
// Fixture tree only; no system profiles, processes or policies are modified.
