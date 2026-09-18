// Run using the actual Windows Electron binary. All HTTPS is intercepted with
// a local synthetic page; no account, device token, network or provider is used.
const { app, BrowserWindow, BrowserView, protocol } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { applyRemoteCommand } = require('../src/provider-remote');
const resultFile=path.resolve(__dirname,'../../tv-presentation-validation/provider-remote-electron-result.json');
fs.mkdirSync(path.dirname(resultFile),{recursive:true});
const record=(result)=>fs.writeFileSync(resultFile,JSON.stringify({at:new Date().toISOString(),...result}));
record({status:'started'});
app.disableHardwareAcceleration();
app.setPath('userData',path.resolve(__dirname,`../../tv-presentation-validation/remote-electron-profile-${process.pid}`));
app.whenReady().then(async()=>{
  await protocol.handle('https',()=>new Response(`<html><body style="margin:0"><button id="button" style="position:absolute;left:200px;top:150px;width:200px;height:100px">Channel</button><script>
    window.events=[]; document.addEventListener('keydown',e=>events.push({type:'key',key:e.key,shift:e.shiftKey}));
    document.getElementById('button').addEventListener('click',()=>events.push({type:'click'}));
  </script></body></html>`,{headers:{'content-type':'text/html'}}));
  const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await win.loadURL('data:text/html,<html><body>Local input verification</body></html>');
  const view=new BrowserView({webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  win.addBrowserView(view); view.setBounds({x:0,y:0,width:1000,height:700});
  await view.webContents.loadURL('https://www.hulu.com/');
  // Electron requires a focused BrowserWindow for sendInputEvent. Position this
  // synthetic test window on the display and close it after assertions.
  win.show(); win.focus(); view.webContents.focus();
  await new Promise(r=>setTimeout(r,1000));
  // Windows may consume the launcher's initial SW_HIDE on the first ShowWindow.
  if (!win.isVisible()) { win.hide(); win.show(); win.focus(); view.webContents.focus(); await new Promise(r=>setTimeout(r,300)); }
  const context={getView:()=>view,canControl:()=>true,openProvider:async()=>{},focus:()=>win.focus()};
  const state={url:view.webContents.getURL(),loading:view.webContents.isLoading(),focused:win.isFocused(),viewFocused:view.webContents.isFocused(),bounds:view.getBounds()};
  assert.equal(await applyRemoteCommand({type:'point',x:0.3,y:0.2857,click:true},context),'applied',JSON.stringify(state));
  assert.equal(await applyRemoteCommand({type:'key',key:'ShiftTab'},context),'applied',JSON.stringify(state));
  await new Promise(r=>setTimeout(r,200));
  const events=await view.webContents.executeJavaScript('window.events');
  assert.ok(events.some(e=>e.type==='click'),`actual Chromium click reaches guide button: ${JSON.stringify({events,state,visible:win.isVisible(),bounds:win.getBounds()})}`);
  assert.ok(events.some(e=>e.type==='key'&&e.key==='Tab'&&e.shift),'actual Chromium receives Shift+Tab');
  assert.equal(await view.webContents.executeJavaScript("Boolean(document.getElementById('myrewrd-remote-pointer'))"),true);
  console.log('PASS Windows Electron actual pointer/click, focus navigation and isolated-world marker');
  record({status:'passed',events});
  win.destroy();app.quit();
}).catch(error=>{record({status:'failed',error:error.message});console.error(error);app.exit(1);});
