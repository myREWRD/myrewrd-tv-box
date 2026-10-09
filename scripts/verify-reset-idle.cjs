const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Windows process scan verification requires Windows');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-idle-fixture-'));
const exe=path.join(home,'myREWRD-TV-Box','runtime-a','myREWRD TV Box.exe');
const main={ProcessId:100,ParentProcessId:1,ExecutablePath:exe,CommandLine:'main'};
const child=(id,parent,type)=>({ProcessId:id,ParentProcessId:parent,ExecutablePath:exe,CommandLine:'--type='+type});
const cases=[
 ['owned-descendants',[main,child(101,100,'renderer'),child(102,101,'utility'),child(103,100,'gpu-process'),child(104,100,'crashpad-handler')],true],
 ['replacement-main',[main,{...main,ProcessId:200}],false],
 ['unrelated-renderer',[main,child(101,999,'renderer')],false],
 ['updater',[main,{ProcessId:201,ExecutablePath:path.join(home,'myREWRD-TV-Box','update-supervisor.exe')}],false],
 ['wifi-helper',[main,{ProcessId:202,ExecutablePath:'C:\\Windows\\System32\\cmd.exe',CommandLine:'myREWRD save-wifi.bat'}],false],
 ['children-after-main-exit',[child(101,100,'renderer')],false],
 ['idle-after-main-exit',[],true],
];
const source=fs.readFileSync('src/assert-reset-idle.ps1','utf8').replace(/^param[^\n]*\r?\n/,'');
for(const [name,processes,allowed] of cases){
 const file=path.join(home,name+'.ps1');
 fs.writeFileSync(file,`$ParentPid=100\nfunction Get-CimInstance {foreach($item in (ConvertFrom-Json $env:FIXTURE_PROCESSES)){$item}}\nfunction Get-ScheduledTask {return @()}\nfunction Test-Path {return $false}\n${source}`);
 const result=spawnSync('powershell.exe',['-NoProfile','-File',file],{env:{...process.env,USERPROFILE:home,APPDATA:home,FIXTURE_PROCESSES:JSON.stringify(processes)},windowsHide:true,encoding:'utf8',timeout:20000});
 assert.equal(result.status,allowed?0:1,name+': '+result.stderr);
 console.log('PASS Windows idle scan '+name);
}
