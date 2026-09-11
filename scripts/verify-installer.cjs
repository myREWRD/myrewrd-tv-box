const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tv-installer-test-'));
const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const source=path.join(root,'payload');fs.mkdirSync(path.join(source,'resources'),{recursive:true});
const bytes=Buffer.alloc(11000000);bytes.write('MZ');fs.writeFileSync(path.join(source,'myREWRD TV Box.exe'),bytes);fs.writeFileSync(path.join(source,'resources','app.asar'),'fixture');fs.writeFileSync(path.join(source,'runtime-release.json'),JSON.stringify({version:'2.0.0',layout:'installed-ab-v1'}));
const zip=path.join(root,'runtime.zip');execFileSync(ps,['-NoProfile','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::CreateFromDirectory(${quote(source)},${quote(zip)})`],{windowsHide:true});
const hash=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
const expand=fs.readFileSync(path.join(__dirname,'../src/expand-runtime.ps1'),'utf8');
const mocks=`
function Get-NetFirewallRule { param($Name,$ErrorAction) }
function Remove-NetFirewallRule { process {} }
function New-NetFirewallRule { param($Name,$DisplayName,$Direction,$Action,$Program,$Protocol,$Profile,$RemoteAddress,$EdgeTraversalPolicy,$Enabled)
 @{Name=$Name;Program=$Program;Protocol=$Protocol;Profile=$Profile;RemoteAddress=$RemoteAddress;EdgeTraversalPolicy=$EdgeTraversalPolicy}|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $env:USERPROFILE 'rules.jsonl')
}
function Invoke-WebRequest { param([switch]$UseBasicParsing,$Uri,$OutFile) [IO.File]::Copy(${quote(zip)},$OutFile) }
function shutdown.exe { [IO.File]::WriteAllText((Join-Path $env:USERPROFILE 'restart.requested'),'mock');$global:LASTEXITCODE=0 }
`;
let script=fs.readFileSync(path.join(__dirname,'install-runtime.template.ps1'),'utf8').replace('#Requires -RunAsAdministrator','').replace(/^if \(\[Security\.Principal\.WindowsIdentity\].*$/m,'# Identity check replaced ONLY in isolated test copy; no production installer executed.').replace('param([switch]$NoRestart)',()=>`param([switch]$NoRestart)\n${mocks}\nfunction ExpandVerifiedRuntime {\n${expand}\n}`).replaceAll('@VERSION@','2.0.0').replaceAll('@HASH@',hash);
const testScript=path.join(root,'mock-installer.ps1');fs.writeFileSync(testScript,script);
function run(home,noRestart=false,expectFailure=false){
 fs.mkdirSync(home,{recursive:true});const appdata=path.join(home,'AppData');fs.mkdirSync(appdata,{recursive:true});
 let failed=false;
 try{execFileSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',testScript,...(noRestart?['-NoRestart']:[])],{env:{...process.env,USERPROFILE:home,APPDATA:appdata},windowsHide:true,stdio:'pipe'});}catch(e){failed=true;if(!expectFailure)throw e;}
 assert.equal(failed,expectFailure,'installer process failure expectation');
 return path.join(home,'myREWRD-TV-Box');
}
function startup(home){return path.join(home,'AppData','Microsoft','Windows','Start Menu','Programs','Startup','myREWRD-TV-Box.bat');}
function config(home){const p=path.join(home,'AppData','myREWRD TV Box','config.json');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'{"paired":"preserved"}');return p;}
const fresh=path.join(root,'fresh'),install=run(fresh,true);
assert.ok(fs.existsSync(path.join(install,'installed-runtime.json')));assert.equal(fs.existsSync(path.join(install,'provisioning-complete.json')),false);assert.equal(fs.existsSync(path.join(fresh,'restart.requested')),false);
run(fresh,true);assert.ok(fs.readFileSync(startup(fresh),'utf8').includes('runtime-a'));
const migrated=path.join(root,'migrated');const cfg=config(migrated);const installed=run(migrated);
assert.equal(fs.readFileSync(cfg,'utf8'),'{"paired":"preserved"}');assert.ok(fs.existsSync(path.join(installed,'provisioning-complete.json')));assert.ok(fs.existsSync(path.join(migrated,'restart.requested')));
fs.cpSync(path.join(installed,'runtime-a'),path.join(installed,'runtime-b'),{recursive:true});const alias=execFileSync(ps,['-NoProfile','-Command',`(New-Object -ComObject Scripting.FileSystemObject).GetFolder(${quote(installed)}).ShortPath`],{windowsHide:true,encoding:'utf8'}).trim();fs.writeFileSync(startup(migrated),`@echo off\r\nstart "" "${path.join(alias,'runtime-b','myREWRD TV Box.exe').toUpperCase()}"\r\n`);const previous=fs.readFileSync(startup(migrated));run(migrated);assert.deepEqual(fs.readFileSync(startup(migrated)),previous);
const interrupted=path.join(root,'interrupted');config(interrupted);const interruptedInstall=path.join(interrupted,'myREWRD-TV-Box');fs.mkdirSync(path.join(interruptedInstall,'installed-runtime.json.tmp'),{recursive:true});run(interrupted,false,true);assert.equal(fs.existsSync(startup(interrupted)),false);assert.ok(fs.existsSync(path.join(interruptedInstall,'runtime-a')));fs.rmdirSync(path.join(interruptedInstall,'installed-runtime.json.tmp'));run(interrupted);assert.ok(fs.existsSync(path.join(interruptedInstall,'provisioning-complete.json')));
for(const home of [fresh,migrated,interrupted]){const rules=fs.readFileSync(path.join(home,'rules.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);for(const r of rules){assert.equal(r.RemoteAddress,'LocalSubnet');assert.equal(r.Profile,'Any');assert.equal(r.EdgeTraversalPolicy,'Block');assert.ok(['TCP','UDP'].includes(r.Protocol));assert.match(r.Program,/runtime-[ab]\\myREWRD TV Box\.exe$/);}}
console.log('PASS isolated installer: fresh resume, preserved pairing, B-slot repair, interrupted commit recovery, permanent local-only rules. No real firewall/startup/reboot modified. Evidence: '+root);
