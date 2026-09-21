const {randomUUID}=require('node:crypto');

// Per-window IPC only. The page gets no bridge, and ordinary remote keys or
// provider subframes cannot ask for, receive, or acknowledge credential input.
function createPrivateForm(contents,{provider,isCurrent,allowed,replyAllowed=allowed,progress=()=>{}}) {
  let document=null,pending=null,disposed=false,navigating=false;
  const current=()=>!disposed&&!contents.isDestroyed()&&isCurrent();
  const trusted=event=>current()&&event.sender===contents&&event.senderFrame===contents.mainFrame&&replyAllowed(event.senderFrame.url);
  const settle=result=>{if(pending){const done=pending.resolve;pending=null;done(result);}};
  function navigation(_event,_url,_inPlace,isMainFrame){if(isMainFrame!==false)navigating=true;}
  function invalidate(){document=null;settle('not_ready');}
  function inPage(_event,url,isMainFrame){
    if(isMainFrame===false)return;
    if(!current()||!document||document.frame!==contents.mainFrame||contents.mainFrame.url!==url||!replyAllowed(url)){invalidate();return;}
    // pushState preserves this exact preload/document. Its pending fixed-step
    // acknowledgement remains valid; no new input is sent to playback pages.
    document.url=url;navigating=false;
  }
  function ready(event,message){
    if(!trusted(event)||typeof message?.documentId!=='string'||!/^[a-f0-9-]{36}$/i.test(message.documentId))return;
    settle('not_ready');navigating=false;document={id:message.documentId,frame:event.senderFrame,url:event.senderFrame.url};progress('form_document_ready');
  }
  function result(event,message){
    if(!trusted(event)||!pending||!document||event.senderFrame!==document.frame
      ||event.senderFrame.url!==document.url||message?.id!==pending.id||message.documentId!==document.id
      ||!['submitted','not_ready','unsupported'].includes(message.result))return;
    settle(message.result);
  }
  contents.ipc.on('tv-private-form-ready',ready);
  contents.ipc.on('tv-private-form-result',result);
  contents.on('did-start-navigation',navigation);
  contents.on('did-navigate',invalidate);
  contents.on('did-navigate-in-page',inPage);
  return {
    execute(step,value,username){
      if(!current()||navigating||!document||pending||document.frame!==contents.mainFrame||document.url!==contents.getURL()||!allowed(document.url))return Promise.resolve('not_ready');
      return new Promise(resolve=>{
        const id=randomUUID();pending={id,resolve};
        try{document.frame.send('tv-private-form-request',{id,documentId:document.id,provider,step,value,username});}
        catch{settle('unsupported');}
      });
    },
    dispose(){
      if(disposed)return;disposed=true;document=null;settle('not_ready');
      contents.ipc.removeListener('tv-private-form-ready',ready);
      contents.ipc.removeListener('tv-private-form-result',result);
      contents.removeListener('did-start-navigation',navigation);
      contents.removeListener('did-navigate',invalidate);
      contents.removeListener('did-navigate-in-page',inPage);
    },
  };
}
module.exports={createPrivateForm};
