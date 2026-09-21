const {app,BrowserWindow,protocol}=require('electron');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createPrivateSignIn}=require('../src/private-signin');
const resultPath=process.argv[2];
const record=value=>{if(resultPath)fs.writeFileSync(resultPath,JSON.stringify(value));};
app.setPath('userData',path.join(app.getPath('temp'),'myrewrd-private-signin-fixture-'+process.pid));
app.on('window-all-closed',()=>{});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  // Local protocol fixture only: no credentials, cookies or provider network.
  protocol.handle('https',request=>{
    if(new URL(request.url).pathname==='/hang')return new Promise(()=>{});
    return new Response('<!doctype html><style>input{display:block;width:300px;height:50px;margin:20px}</style><input type=email id=email><input type=password id=password><button id=continue>Continue</button><img src="/hang"><script>document.querySelector("button").onclick=()=>history.pushState({},"","/watch/home")</script>',{headers:{'content-type':'text/html'}});
  });
  const handlers={},windows=[];
  function Window(options){const w=new BrowserWindow(options);windows.push(w);return w;}
  const remote=createPrivateSignIn({BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers[name]=fn},apiBase:'https://fixture.invalid',getToken:()=> 'fixture',getKey:()=> 'fixture',canStart:()=>true,onStart(){},fetcher:async()=>({ok:true,json:async()=>({session:{kind:'provider-sign-in',id:'fixture',provider:'peacock',lease_ms:8000,offer:{type:'offer',sdp:'v=0'}}})})});
  try{
    await remote.tick();const wc=windows[0].webContents,transport=windows[1].webContents;
    const event={sender:transport,senderFrame:transport.mainFrame};
    let image;for(let i=0;i<30&&!image;i++){await delay(150);image=await handlers['tv-signin-frame'](event);}
    assert.ok(image?.jpeg,'hidden provider supplies a frame before full page load');
    assert.ok(windows.every(w=>!w.isVisible()),'no private window appears on desktop');
    const send=(seq,command)=>handlers['tv-signin-input'](event,{seq,generation:image.generation,command});
    assert.equal(await send(1,{type:'point',x:100/1100,y:45/800,click:true}),true);
    await delay(50);assert.equal(await send(2,{type:'text',text:'fixture@example.invalid'}),true);
    // Fixture-only DOM inspection; never used on a provider page.
    const value=await wc.mainFrame.executeJavaScript('document.querySelector("#email").value');assert.equal(value,'fixture@example.invalid');
    await delay(50);assert.equal(await send(3,{type:'erase'}),true);
    assert.equal(await wc.mainFrame.executeJavaScript('document.querySelector("#email").value'),'');
    await wc.mainFrame.executeJavaScript('history.pushState({},"","/watch/home")');await delay(100);
    assert.equal(remote.active,false,'SPA playback return closes all private windows');
    console.log('PASS actual Windows Electron private sign-in: hidden capture before load completion, point/text/erase IPC, SPA completion and no visible private window.');
    record({ok:true,checks:['hidden-capture','point','text','erase','SPA-completion','hidden-windows']});remote.dispose();app.exit(0);
  }catch(error){record({ok:false,error:String(error.message)});remote.dispose();console.error(error);app.exit(1);}
}).catch(error=>{record({ok:false,error:String(error.message)});console.error(error);app.exit(1);});
