const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const version=require('../package.json').version;
const zip=path.resolve('dist',`myREWRD.TV.Box.${version}.zip`),installer=path.resolve('dist',`myREWRD.TV.Box.${version}.setup.ps1`);
const hash=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
assert.ok(fs.readFileSync(installer,'utf8').includes(`$runtimeHash = '${hash}'`));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tv-real-package-')),runtime=path.join(root,'runtime-a');
const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
execFileSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('src/expand-runtime.ps1'),'-ArchivePath',zip,'-Destination',runtime,'-ExpectedHash',hash,'-ExpectedVersion',version],{windowsHide:true,stdio:'inherit'});
for(const helper of ['expand-runtime.ps1','assert-runtime-idle.ps1','remote-status.ps1'])assert.deepEqual(fs.readFileSync(path.join(runtime,'resources','app.asar.unpacked','src',helper)),fs.readFileSync(path.resolve('src',helper)));
// Native test runs may recompile src/supervisor.exe with a different PE timestamp.
// Compare the ZIP to its packaged input, not to a later compilation.
assert.deepEqual(fs.readFileSync(path.join(runtime,'resources','app.asar.unpacked','src','update-supervisor.exe')),fs.readFileSync(path.resolve('dist/win-unpacked/resources/app.asar.unpacked/src/update-supervisor.exe')));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync(ps,['-NoProfile','-Command',`$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile(${quote(installer)},[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|Out-String|Write-Error;exit 1}`],{windowsHide:true,stdio:'inherit'});
const probe=path.join(root,'probe.cjs');fs.writeFileSync(probe,`
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{EventEmitter}=require('events');
const {prepareUpdate}=require(${JSON.stringify(path.join(runtime,'resources','app.asar','src','update.js'))});
prepareUpdate({installRoot:${JSON.stringify(root)},previousExe:process.execPath,profile:${JSON.stringify(path.join(root,'profile'))},startupPath:${JSON.stringify(path.join(root,'startup.bat'))},
  url:'https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.${version}.zip',sha256:'${hash}',version:'${version}',
  download:async(_url,file)=>fs.copyFileSync(${JSON.stringify(zip)},file),
  spawnProcess:(exe,args)=>{assert.deepEqual(fs.readFileSync(exe),fs.readFileSync(${JSON.stringify(path.join(runtime,'resources','app.asar.unpacked','src','update-supervisor.exe'))}));const m=JSON.parse(fs.readFileSync(args[0],'utf8'));fs.writeFileSync(path.join(path.dirname(args[0]),'supervisor.ready.json'),JSON.stringify({nonce:m.nonce,version:m.version,phase:'supervisor-ready'}));const child=new EventEmitter();child.unref=()=>{};return child;},
}).then(job=>{if(!job.candidateExe.includes('runtime-b'))throw Error('Wrong slot');fs.writeFileSync(${JSON.stringify(path.join(root,'passed'))},job.candidateExe)}).catch(e=>{console.error(e);process.exitCode=1});
`);
execFileSync(path.join(runtime,'myREWRD TV Box.exe'),[probe],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},cwd:root,windowsHide:true,stdio:'inherit',timeout:180000});
assert.ok(fs.existsSync(path.join(root,'passed')));
console.log('PASS actual Windows ZIP, installer syntax/hash, unpacked helpers, packaged Electron staging and physical supervisor copy; '+hash);
