const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-ready-refresh-'));
const q=s=>"'"+s.replaceAll("'","''")+"'";
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const template=fs.readFileSync('scripts/install-runtime.template.ps1','utf8');
const canonical='$env:PSModulePath = "$PSHOME\\Modules"\n'+template.slice(template.indexOf('Add-Type'),template.indexOf("$version ="));
const expand=fs.readFileSync('src/expand-runtime.ps1','utf8');
const ready=fs.readFileSync('src/ready-provision.ps1','utf8');
const payload=path.join(base,'payload');fs.mkdirSync(path.join(payload,'resources/app.asar.unpacked/src'),{recursive:true});
const exe=Buffer.alloc(11000000);exe.write('MZ');fs.writeFileSync(path.join(payload,'myREWRD TV Box.exe'),exe);
fs.writeFileSync(path.join(payload,'resources/app.asar'),'accepted-asar');fs.writeFileSync(path.join(payload,'resources/app.asar.unpacked/src/maintenance-launcher.exe'),'accepted-helper');
fs.writeFileSync(path.join(payload,'runtime-release.json'),JSON.stringify({layout:'installed-ab-v1',version:'2.3.31'}));
const zip=path.join(base,'runtime.zip');execFileSync(ps,['-NoProfile','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::CreateFromDirectory(${q(payload)},${q(zip)})`],{windowsHide:true});
for(const kind of ['old-a','old-b','accepted','same-version-changed','paired','key','incomplete','bad-uuid','bad-zip','bad-asar','bad-helper','foreign-startup','redirect','busy','journal-race','startup-race','rollback']){
 const home=path.join(base,kind),root=path.join(home,'myREWRD-TV-Box'),appdata=path.join(home,'AppData');
 const active=kind==='old-b'?'runtime-b':'runtime-a',inactive=active==='runtime-a'?'runtime-b':'runtime-a';
 fs.mkdirSync(root,{recursive:true});fs.cpSync(payload,path.join(root,active),{recursive:true});
 if(kind!=='accepted')fs.writeFileSync(path.join(root,active,'resources/app.asar'),'old-asar');
 if(kind==='old-a'||kind==='old-b')fs.writeFileSync(path.join(root,active,'runtime-release.json'),JSON.stringify({layout:'installed-ab-v1',version:'2.3.30'}));
 if(kind!=='accepted'){fs.cpSync(payload,path.join(root,inactive),{recursive:true});fs.writeFileSync(path.join(root,inactive,'retained-proof'),'old inactive');}
 const startup=path.join(appdata,'Microsoft/Windows/Start Menu/Programs/Startup/myREWRD-TV-Box.bat');fs.mkdirSync(path.dirname(startup),{recursive:true});
 fs.writeFileSync(startup,`@echo off\r\nstart "" "${kind==='foreign-startup'?path.join(payload,'myREWRD TV Box.exe'):path.join(root,active,'myREWRD TV Box.exe')}"\r\n`);
 const journal=path.join(home,'.kuevy-reset/state.json');fs.mkdirSync(path.dirname(journal),{recursive:true});
 fs.writeFileSync(journal,JSON.stringify({manifest_version:1,phase:kind==='incomplete'?'retired':'ready',device_id:kind==='bad-uuid'?'-'.repeat(36):'11111111-1111-4111-8111-111111111111',id:'22222222-2222-4222-8222-222222222222',api_origin:'https://fixture.invalid',recovery:'preserve-encrypted-receipt'}));
 const support=path.join(home,'support-proof');fs.writeFileSync(support,'Windows/network/CRD fixture preserved');
 const archive=path.join(home,'candidate.zip');fs.copyFileSync(zip,archive);if(kind==='bad-zip')fs.appendFileSync(archive,'tamper');
 if(kind==='paired')fs.writeFileSync(path.join(root,'config.json'),'null');
 if(kind==='key')fs.writeFileSync(path.join(root,active,'reset-key.enc'),'preserve');
 if(kind==='redirect')fs.symlinkSync(payload,path.join(root,'redirect'),'junction');
 const before={startup:fs.readFileSync(startup),journal:fs.readFileSync(journal),active:fs.readFileSync(path.join(root,active,'resources/app.asar'))};
 // Process queries are isolated fixtures; no real processes, firewall or accounts are changed.
 const mocks=`function Get-Process {}\nfunction Start-Sleep {}\nfunction Get-CimInstance {${kind==='busy'?`[pscustomobject]@{ExecutablePath=${q(path.join(root,active,'myREWRD TV Box.exe'))};Name='fixture';CommandLine=''}`:''}}`;
 const mutation=kind==='journal-race'?`[IO.File]::AppendAllText(${q(journal)},' ')`:kind==='startup-race'?`[IO.File]::AppendAllText(${q(startup)},' ')`:'';
 const script=path.join(home,'verify.ps1');
 fs.writeFileSync(script,`$ErrorActionPreference='Stop'\n${canonical}\n${mocks}\nfunction Expand-ActualRuntime {\n${expand}\n}\nfunction ExpandVerifiedRuntime {param($ArchivePath,$Destination,$ExpectedHash,$ExpectedVersion) Expand-ActualRuntime @PSBoundParameters;${mutation}}\n${ready}\n${kind==='rollback'?`$lock=[IO.File]::Open(${q(startup)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)`:''}\ntry {Update-KuevyReadyRuntime -Root ${q(root)} -Startup ${q(startup)} -Archive ${q(archive)} -Version '2.3.31' -ArchiveHash '${sha(fs.readFileSync(zip))}' -AsarHash '${kind==='bad-asar'?'0'.repeat(64):sha('accepted-asar')}' -HelperHash '${kind==='bad-helper'?'0'.repeat(64):sha('accepted-helper')}'} finally {if($lock){$lock.Dispose()}}`);
 let failed=false;try{execFileSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{env:{...process.env,USERPROFILE:home,APPDATA:appdata},windowsHide:true,stdio:'pipe',timeout:30000})}catch(error){failed=true;if(['old-a','old-b','accepted','same-version-changed'].includes(kind))process.stderr.write(String(error.stderr || error.message));}
 const success=['old-a','old-b','accepted','same-version-changed'].includes(kind);assert.equal(failed,!success,kind);
 assert.equal(fs.readFileSync(support,'utf8'),'Windows/network/CRD fixture preserved');assert.deepEqual(fs.readFileSync(path.join(root,active,'resources/app.asar')),before.active);
 if(kind!=='journal-race')assert.deepEqual(fs.readFileSync(journal),before.journal);
 if(success && kind!=='accepted'){
  assert.ok(fs.readFileSync(startup,'utf8').includes(inactive));assert.equal(fs.readFileSync(path.join(root,inactive,'resources/app.asar'),'utf8'),'accepted-asar');
  const retained=fs.readdirSync(root).filter(v=>v.startsWith('.retained-ready-'));assert.equal(retained.length,1);assert.equal(fs.readFileSync(path.join(root,retained[0],'retained-proof'),'utf8'),'old inactive');
 }else if(kind!=='startup-race')assert.deepEqual(fs.readFileSync(startup),before.startup);
 if(!success)assert.equal(fs.readFileSync(path.join(root,inactive,'retained-proof'),'utf8'),'old inactive');
 console.log('PASS Ready runtime refresh '+kind);
}
console.log('No real Windows settings, credentials, startup or running processes were changed. Fixture: '+base);
