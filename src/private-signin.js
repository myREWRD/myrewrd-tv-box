const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {allowedLoginUrl,playbackReturn,HULU_LOGIN,PEACOCK_LOGIN}=require('./provider-account-login');
const {denyPrivatePermissions}=require('./private-permissions');

function createPrivateSignIn({BrowserWindow,ipcMain,apiBase,getToken,getKey,canStart,onStart,fetcher=(...args)=>fetch(...args)}) {
  const file=path.join(__dirname,'pages','private-signin.html');
  let providerWindow=null,transport=null,session=null,lease=0,generation=0,document=null,pending=null;
  let polling=false,capturing=null,blocked=null,sequence=-1,lastCapture=0,lastInput=0;
  let boundToken=null,boundKey=null;
  const valid=()=>Boolean(session&&performance.now()<lease&&getToken()===boundToken&&getKey()===boundKey&&canStart()&&providerWindow&&!providerWindow.isDestroyed());
  const trusted=event=>valid()&&transport&&!transport.isDestroyed()&&event.sender===transport.webContents&&event.senderFrame===transport.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(file).href;
  const settle=value=>{if(pending){clearTimeout(pending.timer);const resolve=pending.resolve;pending=null;resolve(value);}};
  function stop(){
    generation++;if(session)blocked=session.id;
    session=null;lease=0;document=null;capturing=null;boundToken=null;boundKey=null;settle(false);
    if(transport&&!transport.isDestroyed())transport.destroy();transport=null;
    if(providerWindow&&!providerWindow.isDestroyed())providerWindow.destroy();providerWindow=null;
  }
  async function request(body){
    const response=await fetcher(`${apiBase}/api/tv-private-remote`,{method:'POST',headers:{'Content-Type':'application/json','X-TV-Token':getToken(),'X-TV-Presentation-Key':getKey()},body:JSON.stringify({action:'device',...body}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('Unavailable');return response.json();
  }
  function open(next,deadline){
    stop();blocked=null;session=next;lease=deadline;sequence=-1;boundToken=getToken();boundKey=getKey();onStart();
    providerWindow=new BrowserWindow({show:false,width:1100,height:800,skipTaskbar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,devTools:false,preload:path.join(__dirname,'private-signin-preload.js')}});
    const target=providerWindow,contents=target.webContents,run=generation,profile=contents.session;
    const current=()=>run===generation&&providerWindow===target&&valid();
    const invalidate=()=>{document=null;settle(false);};
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    // Cookies stay in the provider profile. No permission is silently granted
    // to the hidden sign-in surface.
    const releasePermissions=denyPrivatePermissions(contents);
    const download=(event,item,wc)=>{if(wc===contents)event.preventDefault();};
    profile.on('will-download',download);
    target.once('closed',()=>{
      profile.removeListener('will-download',download);
      releasePermissions();
    });
    for(const name of ['will-navigate','will-redirect'])contents.on(name,(event,url,_inPlace,main)=>{
      const destination=event.url??url;
      if(!allowedLoginUrl(destination,next.provider)&&!playbackReturn(destination,next.provider)){
        event.preventDefault();if((event.isMainFrame??main)!==false)stop();
      }
    });
    contents.on('did-start-navigation',(_event,_url,inPlace,main)=>{if(main!==false&&!inPlace)invalidate();});
    contents.on('did-navigate',(_event,url)=>{invalidate();if(current()&&playbackReturn(url,next.provider))stop();});
    contents.on('did-navigate-in-page',(_event,url,main)=>{
      if(main===false)return;
      if(current()&&playbackReturn(url,next.provider)){stop();return;}
      settle(false);
      if(document&&document.frame===contents.mainFrame&&allowedLoginUrl(url,next.provider))document={...document,url,generation:randomUUID()};
      else document=null;
    });
    contents.on('render-process-gone',stop);
    contents.ipc.on('tv-signin-ready',(event,message)=>{
      if(!current()||event.sender!==contents||event.senderFrame!==contents.mainFrame||!allowedLoginUrl(event.senderFrame.url,next.provider)||!/^[a-f0-9-]{36}$/i.test(message?.documentId||''))return;
      settle(false);document={id:message.documentId,frame:event.senderFrame,url:event.senderFrame.url,generation:randomUUID()};
    });
    contents.ipc.on('tv-signin-result',(event,message)=>{
      if(!current()||!document||!pending||event.sender!==contents||event.senderFrame!==document.frame||event.senderFrame.url!==document.url||message?.documentId!==document.id||message.id!==pending.id)return;
      settle(message.applied===true);
    });
    contents.on('did-finish-load',()=>{if(current()&&playbackReturn(contents.getURL(),next.provider))stop();});
    transport=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,partition:'tv-private-signin-transport',preload:path.join(__dirname,'private-signin-transport-preload.js')}});
    transport.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    transport.webContents.on('will-navigate',e=>e.preventDefault());transport.webContents.on('render-process-gone',stop);
    transport.loadFile(file).catch(()=>{if(current())stop();});
    void contents.loadURL(next.provider==='peacock'?PEACOCK_LOGIN:HULU_LOGIN).catch(()=>{/* Readiness or lease expiry governs stalled provider loads. */});
  }
  ipcMain.handle('tv-signin-state',event=>trusted(event)?session:null);
  ipcMain.handle('tv-signin-answer',async(event,answer)=>{
    if(!trusted(event)||answer?.type!=='answer'||typeof answer.sdp!=='string'||answer.sdp.length>60000)return false;
    const id=session.id;
    try{await request({session_id:id,answer});return valid()&&session?.id===id;}catch{return false;}
  });
  ipcMain.handle('tv-signin-frame',async event=>{
    if(!trusted(event)||!document||capturing||performance.now()-lastCapture<200)return null;
    const capture={};capturing=capture;lastCapture=performance.now();const doc=document,target=providerWindow,run=generation;
    try {
      const image=await target.webContents.capturePage();
      if(!valid()||run!==generation||document!==doc||target!==providerWindow||target.webContents.getURL()!==doc.url||!allowedLoginUrl(doc.url,session.provider))return null;
      let jpeg=image.resize({width:960}).toJPEG(50);
      if(jpeg.length>60000)jpeg=image.resize({width:640}).toJPEG(30);
      return jpeg.length<=60000?{generation:doc.generation,jpeg:jpeg.toString('base64')}:null;
    }catch{if(run===generation&&target===providerWindow)stop();return null;}finally{if(capturing===capture)capturing=null;}
  });
  ipcMain.handle('tv-signin-input',(event,envelope)=>{
    if(!trusted(event)||!document||pending||!Number.isSafeInteger(envelope?.seq)||envelope.seq<=sequence||envelope.generation!==document.generation||performance.now()-lastInput<40)return false;
    const c=envelope.command;
    if(!c||!['point','text','erase','tab','scroll'].includes(c.type)||JSON.stringify(c).length>7000)return false;
    if(providerWindow.webContents.getURL()!==document.url||!allowedLoginUrl(document.url,session.provider))return false;
    sequence=envelope.seq;lastInput=performance.now();
    return new Promise(resolve=>{
      const id=randomUUID();pending={id,resolve,timer:setTimeout(()=>settle(false),1000)};
      try{document.frame.send('tv-signin-command',{id,documentId:document.id,url:document.url,command:c});}catch{settle(false);}
    });
  });
  async function tick(){
    if(polling)return;
    if(!canStart()||!getToken()||!getKey()){if(session)stop();return;}
    polling=true;const run=generation,token=getToken(),key=getKey(),started=performance.now();
    try{
      const data=await request({});
      if(run!==generation||token!==getToken()||key!==getKey())return;
      const next=data.session;
      if(!canStart()||next?.kind!=='provider-sign-in'||!['hulu','peacock'].includes(next.provider)||!next.offer||next.id===blocked){if(session)stop();return;}
      const deadline=started+Math.min(8000,Number(next.lease_ms)||0);
      if(deadline<=performance.now()){if(session)stop();return;}
      if(session?.id!==next.id)open(next,deadline);else lease=deadline;
    }catch{/* A failed poll never extends the local lease. */}finally{polling=false;}
  }
  const timer=setInterval(tick,3000),watchdog=setInterval(()=>{if(session&&!valid())stop();},100);
  return {tick,stop,get active(){return Boolean(session);},dispose(){clearInterval(timer);clearInterval(watchdog);stop();}};
}
module.exports={createPrivateSignIn};
