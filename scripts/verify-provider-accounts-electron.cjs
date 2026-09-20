const {app,BrowserWindow,protocol}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {runHuluLogin}=require('../src/provider-account-login');
const output=path.resolve(__dirname,'../../tv-presentation-validation/provider-accounts-electron.json');
app.setPath('userData',path.resolve(__dirname,`../../tv-presentation-validation/provider-account-fixture-${process.pid}`));
app.on('window-all-closed',()=>{});
const timer=setTimeout(()=>{fs.writeFileSync(output,JSON.stringify({status:'timeout'}));app.exit(1);},30000);
app.whenReady().then(async()=>{
 let steps=[];
 protocol.handle('https',request=>{
  const u=new URL(request.url);steps.push(u.origin+u.pathname);
  if(u.origin==='https://auth.hulu.com'&&u.pathname==='/web/login/enter-email')return new Response(`<form><input type="email" id="email-field"><button type="submit">Continue</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();if(document.querySelector('input').value==='fixture@example.invalid')location.href='https://auth.hulu.com/web/login/enter-password';};</script>`,{headers:{'content-type':'text/html'}});
  if(u.origin==='https://auth.hulu.com'&&u.pathname==='/web/login/enter-password')return new Response(`<form><input type="password" id="password"><button type="submit">Log In</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();if(document.querySelector('input').value==='fake-password-only')location.href='https://www.hulu.com/';};</script>`,{headers:{'content-type':'text/html'}});
  return new Response('<p>Fixture provider home</p>',{headers:{'content-type':'text/html'}});
 });
 const job={id:'11111111-1111-4111-8111-111111111111',provider:'hulu',expires_at:new Date(Date.now()+20000).toISOString(),credentials:{username:'fixture@example.invalid',password:'fake-password-only'}};
 function InstrumentedWindow(options){const win=new BrowserWindow(options);const load=win.webContents.loadURL.bind(win.webContents);win.webContents.loadURL=async(...args)=>{try{return await load(...args);}catch(error){steps.push('load: '+error.message);throw error;}};const execute=win.webContents.executeJavaScriptInIsolatedWorld.bind(win.webContents);win.webContents.executeJavaScriptInIsolatedWorld=async(...args)=>{try{return await execute(...args);}catch(error){steps.push('execution: '+error.message);throw error;}};return win;} const status=await runHuluLogin({BrowserWindow:InstrumentedWindow,job,signal:new AbortController().signal});
 assert.equal(status,'submitted',JSON.stringify({status,steps}));assert.equal(job.credentials.password,'');assert.ok(steps.includes('https://www.hulu.com/'));assert.equal(BrowserWindow.getAllWindows().length,0);
 clearTimeout(timer);fs.writeFileSync(output,JSON.stringify({status:'passed',checks:['real Chromium email/password submission','hidden sandboxed window','exact provider return','window cleanup'],providerNetworkUsed:false}));app.exit(0);
}).catch(error=>{clearTimeout(timer);fs.writeFileSync(output,JSON.stringify({status:'failed',message:error.message}));app.exit(1);});
