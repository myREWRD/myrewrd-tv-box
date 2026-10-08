const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
// Windows CI TEMP may contain RUNNER~1. Match the supervisor's GetFullPath
// identity instead of passing a short alias as the expected executable.
const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-ready-watchdog-')));
const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const source=fs.readFileSync('src/runtime-watchdog.ps1','utf8'),q=s=>"'"+s.replaceAll("'","''")+"'";
for(const kind of ['yield','wrong-stamp','stale','ordinary-crash','incomplete','wrong-manifest']){
 const home=path.join(base,kind),root=path.join(home,'myREWRD-TV-Box'),exe=path.join(root,'runtime-a/myREWRD TV Box.exe'),health=path.join(root,'.health/123.json'),journal=path.join(home,'.kuevy-reset/state.json');
 fs.mkdirSync(path.dirname(health),{recursive:true});fs.mkdirSync(path.dirname(journal),{recursive:true});
 fs.writeFileSync(journal,JSON.stringify({manifest_version:kind==='wrong-manifest'?2:1,phase:kind==='incomplete'?'retired':'ready'}));
 const stamp=Date.now()-10000;fs.writeFileSync(health,JSON.stringify({phase:kind==='ordinary-crash'?'running':'provisioning',startedAt:kind==='wrong-stamp'?stamp+3000:stamp,at:kind==='stale'?Date.now()-180000:Date.now()}));
 const startup=path.join(home,'AppData/Microsoft/Windows/Start Menu/Programs/Startup/myREWRD-TV-Box.bat');fs.mkdirSync(path.dirname(startup),{recursive:true});fs.writeFileSync(startup,`@echo off\r\nstart "" "${exe}"\r\n`);
 const proof=path.join(home,'restart-proof'),script=path.join(home,'watchdog.ps1');
 const mocks=`function Start-Sleep {}\nfunction Get-Process {}\nfunction Get-CimInstance {}\nfunction Start-Process {param($FilePath,$WindowStyle) [IO.File]::WriteAllText(${q(proof)},$FilePath)}`;
 fs.writeFileSync(script,source.replace("$ErrorActionPreference='Stop'",()=>`$ErrorActionPreference='Stop'\n${mocks}`));
 execFileSync(ps,['-NoProfile','-File',script,'-ParentPid','123','-StartedAt',String(stamp),'-Executable',exe,'-HealthFile',health],{env:{...process.env,USERPROFILE:home,APPDATA:path.join(home,'AppData')},windowsHide:true,stdio:'pipe'});
 assert.equal(fs.existsSync(proof),!['yield','incomplete'].includes(kind),kind);if(fs.existsSync(proof))assert.equal(fs.readFileSync(proof,'utf8'),exe);
 console.log('PASS Ready supervisor '+kind);
}
