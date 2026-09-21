const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {applyProviderUserAgent,chromiumAgent}=require('../src/provider-user-agent');
const resultPath=process.argv[2];
app.setPath('userData',path.join(app.getPath('temp'),'myrewrd-agent-fixture-'+process.pid));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const c=w.webContents,original=c.getUserAgent();
 applyProviderUserAgent(c,'https://www.peacocktv.com/signin');
 await c.loadURL('data:text/html,<title>Local compatibility fixture</title>');
 const actual=await c.executeJavaScript('navigator.userAgent');
 assert.equal(actual,chromiumAgent(original));assert.ok(!/Electron\//.test(actual));
 assert.equal(actual.match(/Chrome\/[^ ]+/)?.[0],original.match(/Chrome\/[^ ]+/)?.[0]);
 applyProviderUserAgent(c,'https://www.hulu.com/');assert.equal(c.getUserAgent(),original);
 if(resultPath)fs.writeFileSync(resultPath,JSON.stringify({ok:true,checks:['native-user-agent','real-chromium-version','other-provider-restoration']}));
 w.destroy();app.exit(0);
}).catch(e=>{if(resultPath)fs.writeFileSync(resultPath,JSON.stringify({ok:false,error:e.message}));app.exit(1);});
