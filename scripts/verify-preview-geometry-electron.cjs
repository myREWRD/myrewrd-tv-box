// Actual Chromium geometry; local synthetic documents only, no provider account.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { hiddenChildFramesCode } = require('../src/preview-frame-visibility');
const resultFile=path.resolve(__dirname,'../../tv-presentation-validation/preview-geometry-electron.json');
fs.mkdirSync(path.dirname(resultFile),{recursive:true});
const results=[];
let timedOut=false;
const deadline=setTimeout(()=>{timedOut=true;fs.writeFileSync(resultFile,JSON.stringify({status:'failed',error:'fixture deadline',results}));app.exit(1);},90000);
app.setPath('userData',path.resolve(__dirname,`../../tv-presentation-validation/preview-geometry-profile-${process.pid}`));
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{}); // Keep the fixture alive between isolated cases.
app.whenReady().then(async()=>{
  let documentHtml='',page=0;
  const server=http.createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end(documentHtml);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let win;
  const evaluate=()=>win.webContents.executeJavaScriptInIsolatedWorld(1002,[{code:hiddenChildFramesCode}]);
  async function check(name,html,hidden,count=1) {
    if(win)win.destroy();
    win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    documentHtml=html;
    await win.loadURL(`http://127.0.0.1:${server.address().port}/${++page}`);
    const value=await evaluate();
    assert.equal(value.hidden && value.count===win.webContents.mainFrame.frames.length,hidden,name);assert.equal(value.count,count,name);
    results.push(name);
  }
  const frame='<iframe sandbox srcdoc="<input type=password value=synthetic>"></iframe>';
  await check('display-none script-disabled child','<style>iframe{display:none}</style>'+frame,true);
  let rejected=false;try {await Promise.race([win.webContents.mainFrame.frames[0].executeJavaScript('false'),new Promise((_,reject)=>setTimeout(()=>reject(Error('bounded timeout')),1000))]);} catch {rejected=true;}
  results.push('script-disabled evaluation '+(rejected?'rejects':'supported'));
  await check('positive-area script-disabled credential child',frame,false);
  await check('zero-width child','<style>iframe{width:0;border:0}</style>'+frame,true);
  await check('offscreen positive-area child','<style>iframe{position:absolute;left:-10000px}</style>'+frame,false);
  await check('visibility-hidden remains conservative','<style>iframe{visibility:hidden}</style>'+frame,false);
  await check('opaque embedded content','<object></object>',false,0);
  await check('closed shadow owner unmatched',`<div id=h></div><script>h.attachShadow({mode:'closed'}).innerHTML=${JSON.stringify('<style>iframe{display:none}</style>'+frame)}</script>`,false,0);
  assert.equal(win.webContents.mainFrame.frames.length,1,'closed shadow native frame cannot be skipped');
  await check('open shadow absent from window.frames stays conservative',`<div id=h></div><script>h.attachShadow({mode:'open'}).innerHTML=${JSON.stringify('<style>iframe{display:none}</style>'+frame)}</script>`,false,0);
  await check('nested subtree hidden at root','<iframe style="display:none" srcdoc="<iframe srcdoc=child></iframe>"></iframe>',true);
  assert.ok(win.webContents.mainFrame.framesInSubtree.length>=3,'nested fixture loaded');
  await win.webContents.executeJavaScript("document.querySelector('iframe').style.display='block'");
  assert.equal((await evaluate()).hidden,false,'visibility change reevaluated');results.push('visibility change reevaluated');
  fs.writeFileSync(resultFile,JSON.stringify({status:'passed',results},null,2));
  clearTimeout(deadline);win.destroy();server.close();app.quit();
}).catch(error=>{if(!timedOut)fs.writeFileSync(resultFile,JSON.stringify({status:'failed',error:error.message,results},null,2));app.exit(1);});
