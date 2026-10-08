const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-ready-compat-')),ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const q=s=>"'"+s.replaceAll("'","''")+"'",sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const template=fs.readFileSync('scripts/install-runtime.template.ps1','utf8');
const canonical=template.slice(template.indexOf('Add-Type'),template.indexOf("$version ="));
const source=fs.readFileSync('src/ready-provision.ps1','utf8');
for(const kind of ['normal-close','fractional-stamp','cancel','foreign-supervisor','duplicate-supervisor','no-window','owner-reused','journal-changed','missing-bridge','corrupt-bridge','close-refused','close-timeout']){
 const home=path.join(base,kind),root=path.join(home,'myREWRD-TV-Box'),active=path.join(root,'runtime-a/myREWRD TV Box.exe'),folder=path.join(root,'runtime-a/resources/app.asar.unpacked/src');fs.mkdirSync(folder,{recursive:true});
 const bridge=Buffer.alloc(128);bridge.write('MZ');bridge.writeUInt32LE(64,60);bridge.write('PE\0\0',64);if(kind==='corrupt-bridge')bridge[0]=0;
 fs.writeFileSync(active,'fixture');fs.writeFileSync(path.join(root,'runtime-a/resources/app.asar'),'accepted-asar');fs.writeFileSync(path.join(folder,'maintenance-launcher.exe'),bridge);fs.writeFileSync(path.join(folder,'runtime-watchdog.ps1'),'fixture');fs.writeFileSync(path.join(root,'runtime-a/runtime-release.json'),' {"layout":"installed-ab-v1","version":"2.3.31"}');
 const startup=path.join(home,'AppData/Microsoft/Windows/Start Menu/Programs/Startup/myREWRD-TV-Box.bat'),journal=path.join(home,'.kuevy-reset/state.json');fs.mkdirSync(path.dirname(startup),{recursive:true});fs.mkdirSync(path.dirname(journal),{recursive:true});fs.writeFileSync(startup,`@echo off\r\nstart "" "${active}"\r\n`);fs.writeFileSync(journal,'{"manifest_version":1,"phase":"ready","device_id":"11111111-1111-4111-8111-111111111111","api_origin":"https://fixture.invalid"}');
 const before={startup:fs.readFileSync(startup),journal:fs.readFileSync(journal)};
 const stamp=Date.now()-10000,command=`"${ps}" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${path.join(folder,'runtime-watchdog.ps1')}" -ParentPid ${kind==='foreign-supervisor'?8:7} -StartedAt "${kind==='fractional-stamp'?stamp+0.25:stamp}" -Executable "${active}" -HealthFile "${path.join(root,'.health/7.json')}"`;
 const proof=path.join(home,'proof.json');
 const mocks=`
$global:ownerAlive=$true;$global:watchAlive=$true;$global:watchId=9;$global:confirmed=$false;$global:stops=0;$global:closes=0;$global:restores=0
$global:ownerStart=[DateTimeOffset]::FromUnixTimeMilliseconds(${stamp}).UtcDateTime
function Owner-Object {
 $start=$global:ownerStart;if($global:confirmed -and '${kind}' -eq 'owner-reused'){$start=$start.AddSeconds(5)}
 $item=[pscustomobject]@{Id=7;Path=${q(active)};StartTime=$start;MainWindowHandle=${kind==='no-window'?0:1}}
 $item|Add-Member ScriptMethod CloseMainWindow {$global:closes++;if('${kind}' -eq 'close-refused'){return $false};if('${kind}' -ne 'close-timeout'){$global:ownerAlive=$false};return $true}
 $item|Add-Member ScriptMethod WaitForExit {param($Timeout) return ('${kind}' -ne 'close-timeout')};return $item
}
function Get-Process {param($Id,$ErrorAction) if($Id -eq 9){return [pscustomobject]@{Id=9;Path=${q(ps)};StartTime=$global:ownerStart.AddSeconds(1)}};if($global:ownerAlive){Owner-Object}}
function Get-CimInstance {param($ClassName,$Filter) if($global:watchAlive){$value=[pscustomobject]@{ProcessId=$global:watchId;Name='powershell.exe';ExecutablePath=${q(ps)};CommandLine=${q(command)}};if($Filter){return $value};if($global:ownerAlive){[pscustomobject]@{ProcessId=7;Name='fixture';ExecutablePath=${q(active)};CommandLine='fixture'}};$value;if('${kind}' -eq 'duplicate-supervisor'){$value}}elseif($global:ownerAlive){[pscustomobject]@{ProcessId=7;ExecutablePath=${q(active)};Name='fixture';CommandLine='fixture'}}}
function Stop-Process {param($InputObject,[switch]$Force) if($InputObject.Id -ne 9){throw 'Unexpected stop'};$global:stops++;$global:watchAlive=$false}
function Start-Sleep {}
function Start-Process {param($FilePath,$ArgumentList,$WindowStyle) if($FilePath -eq ${q(path.join(folder,'maintenance-launcher.exe'))}){$global:restores++;$global:watchAlive=$true;$global:watchId=10}}
`;
 // Only the native confirmation UI is replaced in this isolated source copy.
 // All ownership validation, native-close calls and recovery decisions remain.
 const ready=source.replace('Add-Type -AssemblyName System.Windows.Forms','# Test-only native dialog replacement').replace(/\$answer=\[Windows.Forms.MessageBox\]::Show\([^\n]+/g,()=>`$global:confirmed=$true;${kind==='journal-changed'?`[IO.File]::AppendAllText(${q(journal)},' ');`:''}$answer='${kind==='cancel'?'No':'Yes'}'`).replace('$answer -ne [Windows.Forms.DialogResult]::Yes',"$answer -ne 'Yes'");
 assert.notEqual(ready,source);
 const script=path.join(home,'verify.ps1');fs.writeFileSync(script,`$ErrorActionPreference='Stop';$env:PSModulePath="$PSHOME\\Modules"\n${canonical}\n${mocks}\n${ready}\ntry {Update-KuevyReadyRuntime -Root ${q(root)} -Startup ${q(startup)} -Version '2.3.31' -ArchiveHash '${'0'.repeat(64)}' -AsarHash '${sha('accepted-asar')}' -HelperHash '${sha(bridge)}';$passed=$true} catch {$passed=$false}\n@{passed=$passed;stops=$global:stops;closes=$global:closes;restores=$global:restores}|ConvertTo-Json -Compress|Set-Content -LiteralPath ${q(proof)}`);
 // Simulate a missing old bridge after accepted-content resolution but before
 // compatibility preflight (the active helper content pin is initially valid).
 if(kind==='missing-bridge')fs.writeFileSync(script,fs.readFileSync(script,'utf8').replace("function Start-Process {param($FilePath,$ArgumentList,$WindowStyle)",`function Start-Process {param($FilePath,$ArgumentList,$WindowStyle) if($FilePath -eq ${q(active)}){[IO.File]::Delete(${q(path.join(folder,'maintenance-launcher.exe'))})};`));
 execFileSync(ps,['-NoProfile','-File',script],{env:{...process.env,USERPROFILE:home,APPDATA:path.join(home,'AppData')},windowsHide:true,stdio:'pipe'});
 const result=JSON.parse(fs.readFileSync(proof,'utf8'));assert.equal(result.passed,['normal-close','fractional-stamp'].includes(kind),kind);assert.equal(result.stops,['normal-close','fractional-stamp','close-refused','close-timeout'].includes(kind)?1:0,kind);assert.equal(result.restores,['close-refused','close-timeout'].includes(kind)?1:0,kind);assert.deepEqual(fs.readFileSync(startup),before.startup);if(kind!=='journal-changed')assert.deepEqual(fs.readFileSync(journal),before.journal);
 console.log('PASS attended older Ready compatibility '+kind);
}
console.log('No real processes or native dialogs used; actual old-runtime physical acceptance remains required.');
