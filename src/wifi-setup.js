const {spawn}=require('node:child_process');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const results=new Set(['saved','existing_network','no_adapter','multiple_adapters','windows_error','unsupported','invalid_request']);
function validDetails(v){return v&&typeof v.ssid==='string'&&Buffer.byteLength(v.ssid,'utf8')>=1&&Buffer.byteLength(v.ssid,'utf8')<=32&&!/[\x00-\x1f\x7f]/.test(v.ssid)&&typeof v.password==='string'&&(/^[\x20-\x7e]{8,63}$/.test(v.password)||/^[a-fA-F0-9]{64}$/.test(v.password));}
function saveWifi(details,{spawnProcess=spawn,platform=process.platform}={}) {
 if(!validDetails(details))return Promise.resolve('invalid_request');
 if(platform!=='win32')return Promise.resolve('unsupported');
 return new Promise(resolve=>{
  let output='',done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
  const helper=path.join(__dirname.replace('app.asar','app.asar.unpacked'),'save-wifi.ps1');
  const child=spawnProcess('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  const timer=setTimeout(()=>{child.kill();finish('windows_error');},15000);
  child.on('error',()=>finish('windows_error'));
  child.stdout.on('data',part=>{output+=part.toString('utf8');if(output.length>128){child.kill();finish('windows_error');}});
  child.on('close',code=>finish(code===0&&results.has(output.trim())?output.trim():'windows_error'));
  child.stdin.on('error',()=>finish('windows_error'));
  child.stdin.end(JSON.stringify({ssid:details.ssid,password:details.password}));
 });
}
function createWifiSetup({apiBase,getToken,getKey,canPoll,fetcher=(...args)=>fetch(...args),save=saveWifi,monotonic=()=>performance.now(),readReceipt=()=>null,writeReceipt=()=>{}}) {
 let busy=false,receipt=null;
 try {const old=readReceipt();if(old&&/^[a-f0-9-]{36}$/i.test(old.id)&&results.has(old.result))receipt=old;}catch{}
 async function tick(){
  if(busy||!canPoll()||!getToken()||!getKey())return;
  busy=true;const token=getToken(),key=getKey();
  const current=()=>canPoll()&&token===getToken()&&key===getKey();
  const headers={'Content-Type':'application/json','X-TV-Token':token,'X-TV-Presentation-Key':key};
  let job;
  async function request(body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetcher(`${apiBase}/api/tv-wifi`,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,redirect:'error'});if(!response.ok)return null;const raw=await response.text();if(raw.length>4096)return null;return JSON.parse(raw);}finally{clearTimeout(timer);}}
  try {
   const started=monotonic(),response=await request({action:'poll',protocol:1});if(!response||!current())return;
   job=response.job;if(job===null)return;
   if(!job||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(job.id)||!validDetails(job)||!Number.isInteger(job.remaining_ms)||job.remaining_ms>600000||job.remaining_ms-(monotonic()-started)<30000||!current())return;
   let result=receipt?.id===job.id?receipt.result:await save(job);
   if(!results.has(result))result='windows_error';
   receipt={id:job.id,result};try{writeReceipt(receipt);}catch{}
   job.password='';
   if(!current())return;
   await request({action:'report',protocol:1,job_id:job.id,status:result==='saved'?'saved':'failed',...(result==='saved'?{}:{reason:result})});
  }catch{/* No secrets, response bodies or Windows errors in logs. Retry idempotently. */}
  finally {if(job)job.password='';busy=false;}
 }
 return {tick,get active(){return busy;}};
}
module.exports={createWifiSetup,saveWifi,validDetails};
