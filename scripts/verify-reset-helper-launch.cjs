const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Native helper acceptance requires Windows');
require('./build-supervisor.cjs').build();
const base=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'kuevy-helper-launch-'));
const modulePath=path.resolve('src/reset-helper-launch.js');
const script=`param([string]$Journal,[int]$ParentPid,[string]$Executable,[string]$ReadyNonce)
$ErrorActionPreference='Stop'
$folder=[IO.Path]::GetDirectoryName($Journal)
if($env:FIXTURE_CASE -eq 'early-exit'){exit 1}
$readyNonce=if($env:FIXTURE_CASE -eq 'wrong-receipt'){'b'*64}else{$ReadyNonce}
[IO.File]::WriteAllText((Join-Path $folder 'cleanup-ready.json'),(@{phase='helper-ready';nonce=$readyNonce;parent_pid=$ParentPid}|ConvertTo-Json -Compress))
for($n=0;$n -lt 150 -and (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue);$n++){Start-Sleep -Milliseconds 100}
if(Get-Process -Id $ParentPid -ErrorAction SilentlyContinue){exit 1}
$approved=$false
$file=Join-Path $folder 'cleanup-go.json'
if(Test-Path -LiteralPath $file){$go=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json;$approved=($go.phase -eq 'handoff-approved' -and $go.nonce -eq $ReadyNonce -and $go.parent_pid -eq $ParentPid)}
[IO.File]::WriteAllText((Join-Path $folder 'child-proof.json'),(@{survived=$true;approved=$approved}|ConvertTo-Json -Compress))
`;
(async()=>{
 for(const kind of ['success','wrong-receipt','early-exit']){
  const home=path.join(base,kind),root=path.join(home,'myREWRD-TV-Box'),slot=path.join(root,'runtime-a'),folder=path.join(home,'.kuevy-reset');
  const helper=path.join(slot,'resources','app.asar.unpacked','src','maintenance-launcher.exe'),exe=path.join(slot,'myREWRD TV Box.exe'),journal=path.join(folder,'state.json');
  fs.mkdirSync(path.dirname(helper),{recursive:true});fs.mkdirSync(folder,{recursive:true});
  fs.copyFileSync('src/maintenance-launcher.exe',helper);fs.writeFileSync(exe,'synthetic-unused-executable');fs.writeFileSync(journal,'{"phase":"retired"}');
  fs.writeFileSync(path.join(folder,'cleanup.ps1'),script);
  const parent=path.join(home,'parent.cjs'),parentProof=path.join(home,'parent-proof.json');
  fs.writeFileSync(parent,`const fs=require('fs'),path=require('path'),{launchResetHelper}=require(${JSON.stringify(modulePath)});
   const plain=file=>{if(!path.resolve(file).startsWith(${JSON.stringify(home+path.sep)}))throw Error('Fixture boundary');let cursor=path.resolve(file);while(cursor!==path.dirname(cursor)){if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Fixture redirect');cursor=path.dirname(cursor);}};
   launchResetHelper({helper:${JSON.stringify(helper)},journal:${JSON.stringify(journal)},executable:${JSON.stringify(exe)},plain,timeoutMs:2000})
   .then(()=>{fs.writeFileSync(${JSON.stringify(parentProof)},JSON.stringify({ready:true}));process.exit(0);})
   .catch(()=>{fs.writeFileSync(${JSON.stringify(parentProof)},JSON.stringify({ready:false}));process.exit(0);});`);
  // Establish the normal desktop process boundary. A nested Node/libuv job
  // can block a second Windows spawn; the installed GUI is launched by Windows.
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const command=`$env:USERPROFILE=${quote(home)};$env:FIXTURE_CASE=${quote(kind)};$p=Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${quote('"'+parent+'"')} -WindowStyle Hidden -PassThru -Wait;exit $p.ExitCode`;
  const result=spawnSync(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,'Synthetic Windows parent failed: '+kind+' '+(result.error?.message||result.stderr));assert.equal(JSON.parse(fs.readFileSync(parentProof,'utf8')).ready,kind==='success');
  const proof=path.join(folder,'child-proof.json'),deadline=Date.now()+10000;
  if(kind!=='early-exit'){
   while(!fs.existsSync(proof)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
   assert.deepEqual(JSON.parse(fs.readFileSync(proof,'utf8')),{approved:kind==='success',survived:true});
  }else assert.equal(fs.existsSync(path.join(folder,'cleanup-go.json')),false);
  assert.equal(fs.readFileSync(exe,'utf8'),'synthetic-unused-executable');assert.equal(fs.readFileSync(journal,'utf8'),'{"phase":"retired"}');
  console.log('PASS native hidden PowerShell bootstrap, parent exit and handoff '+kind);
  if(kind==='success'){
   const health=path.join(root,'.health','123.json'),watchProof=path.join(folder,'watchdog-proof.json');
   fs.mkdirSync(path.dirname(health),{recursive:true});fs.writeFileSync(health,'{}');
   fs.writeFileSync(path.join(path.dirname(helper),'runtime-watchdog.ps1'),`param([int]$ParentPid,[double]$StartedAt,[string]$Executable,[string]$HealthFile)
[IO.File]::WriteAllText('${watchProof.replaceAll("'","''")}','started')`);
   const watch=spawnSync(helper,['watchdog','123',String(Date.now()),exe,health],{env:{...process.env,USERPROFILE:home},windowsHide:true,encoding:'utf8',timeout:5000});
   assert.equal(watch.status,0);
   const watchDeadline=Date.now()+5000;while(!fs.existsSync(watchProof)&&Date.now()<watchDeadline)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal(fs.readFileSync(watchProof,'utf8'),'started');console.log('PASS native Windows watchdog bootstrap');
  }
  for(const args of [['unknown',journal,'123',exe,'a'.repeat(64)],['reset',journal,'0',exe,'a'.repeat(64)],['reset',journal,'123',exe,'invalid'],['reset',journal,'123',exe,'a'.repeat(64)+'\n'],['watchdog','123','NaN',exe,path.join(root,'.health','123.json')],['watchdog','123',String(Date.now()),exe,path.join(home,'outside.json')],['reset',path.join(home,'wrong.json'),'123',exe,'a'.repeat(64)],['reset',journal,'123',path.join(home,'outside.exe'),'a'.repeat(64)]]){
   const denied=spawnSync(helper,args,{env:{...process.env,USERPROFILE:home},windowsHide:true,encoding:'utf8',timeout:5000});assert.equal(denied.status,1,'Native argument guard accepted');
  }
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
