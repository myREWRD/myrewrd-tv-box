const assert=require('node:assert/strict'),fs=require('node:fs'),{EventEmitter}=require('node:events');
const {createWifiSetup,saveWifi,validDetails}=require('../src/wifi-setup');
const details={ssid:'Venue & " Wi-Fi',password:'Fixture<>&123'},id='00000000-0000-4000-8000-000000000001';
(async()=>{
 assert(validDetails(details));assert(!validDetails({...details,ssid:'é'.repeat(17)}));assert(!validDetails({...details,password:'short'}));assert(!validDetails({...details,ssid:'bad\nname'}));
 let args,input,saves=0,reports=[],receipt=null,job={id,remaining_ms:60000,...details},ready=true;
 const fakeSpawn=(file,a,options)=>{args={file,a,options};const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=v=>{input=v;queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('saved'));child.emit('close',0);});};child.kill=()=>{};return child;};
 assert.equal(await saveWifi(details,{platform:'win32',spawnProcess:fakeSpawn}),'saved');assert.equal(args.options.windowsHide,true);assert(!JSON.stringify(args).includes(details.password));assert.equal(JSON.parse(input).password,details.password);
 const receiver=createWifiSetup({apiBase:'https://fixture.invalid',getToken:()=> 'token',getKey:()=> 'key',canPoll:()=>ready,save:async()=>{saves++;return 'saved';},writeReceipt:v=>{receipt=v;},fetcher:async(url,init)=>{assert.equal(init.redirect,'error');const body=JSON.parse(init.body);if(body.action==='report'){reports.push(body);return Response.json({ok:true});}return Response.json({job});}});
 await receiver.tick();await receiver.tick();assert.equal(saves,1);assert.equal(reports.length,2);assert.equal(receipt.result,'saved');assert(!JSON.stringify(receipt).includes(details.password));assert(!JSON.stringify(reports).includes(details.password));
 job={...job,id:'invalid'};await receiver.tick();assert.equal(saves,1);job={...job,id,remaining_ms:1};await receiver.tick();assert.equal(saves,1);
 ready=false;await receiver.tick();assert.equal(saves,1);
 const script=fs.readFileSync('src/save-wifi.ps1','utf8');assert(!/WlanConnect|wlan connect|WriteAllText|key=clear|Write-Host/.test(script));assert.match(script,/WlanSetProfilePosition/);assert.match(script,/<autoSwitch>false/);assert.match(script,/return "existing_network"/);
 if(process.platform==='win32') {
  const {spawnSync}=require('node:child_process');
  const compilation=script.match(/Add-Type[^\r\n]*@'[\s\S]*?\r?\n'@/)[0];
  const compiled=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; "+compilation],{windowsHide:true,encoding:'utf8'});
  assert.equal(compiled.status,0,'Windows PowerShell must compile the actual WLAN helper: '+compiled.stderr);
  const encoding=script.match(/^\[Console\]::InputEncoding.*$/m)[0];
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',encoding+'; $v=[Console]::In.ReadToEnd() | ConvertFrom-Json; [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($v.ssid)))'],{windowsHide:true,input:JSON.stringify({ssid:'Café 海辺'}),encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(Buffer.from(result.stdout,'base64').toString('utf8'),'Café 海辺');
 }
 console.log('PASS Wi-Fi receiver: validation, secret-free arguments/receipts, duplicate delivery, expiry, enrollment readiness and no connect calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
