const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {applyKeyboard}=require('../src/provider-keyboard');
const output=path.resolve(__dirname,'../../tv-presentation-validation/provider-keyboard-electron.json');
app.setPath('userData',path.resolve(__dirname,'../../tv-presentation-validation/keyboard-fixture-'+process.pid));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}),c=w.webContents;
 await c.loadURL('data:text/html,<input id="search" type="search"><input id="password" type="password">');
 await c.executeJavaScript("document.getElementById('search').focus()");
 assert.equal(await applyKeyboard({type:'text',text:'sports'}, {contents:c,current:()=>true}),'applied');
 assert.equal(await c.executeJavaScript("document.getElementById('search').value"),'sports');
 assert.equal(await applyKeyboard({type:'erase'}, {contents:c,current:()=>true}),'applied');
 assert.equal(await c.executeJavaScript("document.getElementById('search').value"),'sport');
 await c.executeJavaScript("document.getElementById('password').focus()");
 assert.equal(await applyKeyboard({type:'text',text:'never-insert'}, {contents:c,current:()=>true}),'unavailable');
 assert.equal(await c.executeJavaScript("document.getElementById('password').value"),'');
 w.destroy();fs.writeFileSync(output,JSON.stringify({status:'passed',checks:['real Chromium focused search typing','Backspace','password-field denial'],providerNetworkUsed:false}));app.exit(0);
}).catch(e=>{fs.writeFileSync(output,JSON.stringify({status:'failed',message:e.message}));app.exit(1);});
