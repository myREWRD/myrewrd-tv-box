// This preload is only attached to an invisible provider sign-in window.
// It exposes no API to provider JavaScript and never returns field values.
const {ipcRenderer}=require('electron');
if(process.isMainFrame) {
  const documentId=crypto.randomUUID();
  const allowed=()=>location.protocol==='https:'&&!location.port&&(
    location.hostname==='www.peacocktv.com'&&['/start','/signin'].includes(location.pathname)
    ||location.hostname==='auth.hulu.com'&&/^\/web\/login(?:\/|$)/.test(location.pathname)
    ||location.hostname==='www.amazon.com'&&(location.pathname==='/ap/mfa'||/^\/ap\/signin(?:\/\d{3}-\d{7}-\d{7})?$/.test(location.pathname))
    ||location.hostname==='www.primevideo.com'&&location.pathname==='/');
  const primeEntry=()=>location.origin==='https://www.primevideo.com'&&location.pathname==='/';
  let ready=false;
  ipcRenderer.on('tv-signin-command',async(_event,request)=>{
    if(!ready||!allowed()||request?.documentId!==documentId||request.url!==location.href||typeof request.id!=='string')return;
    let applied=false;
    try {
      const c=request.command;
      if(primeEntry()) {
        if(c?.type==='prime-entry') {
          applied=await new Promise(resolve=>{
            let finished=false;
            const finish=value=>{if(finished)return;finished=true;clearTimeout(timeout);observer.disconnect();resolve(value);};
            const check=()=>{
              if(!primeEntry()||location.href!==request.url){finish(false);return;}
              const links=[...document.querySelectorAll('a[href]')].filter(element=>{
                try{const u=new URL(element.href);return u.origin==='https://www.primevideo.com'&&!u.port&&!u.username&&!u.password&&u.pathname==='/auth-redirect'&&/^sign\s+in$/i.test(element.textContent.trim())&&element.getClientRects().length&&['','_self'].includes(element.target||'');}catch{return false;}
              });
              // The provider renders responsive Sign In duplicates with
              // different contextual queries. Each eligible link is still the
              // same exact provider-owned entry endpoint; redirects remain
              // restricted by the main process. Never synthesize its query.
              if(links.length){links[0].click();finish(true);}
            };
            const observer=new MutationObserver(check),timeout=setTimeout(()=>finish(false),10000);
            observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true});check();
          });
        }
      } else if(c?.type==='point'&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.x>=0&&c.x<=1&&c.y>=0&&c.y<=1) {
        const element=document.elementFromPoint(c.x*innerWidth,c.y*innerHeight);
        // Never forward coordinates into an embedded account/verification frame.
        if(element instanceof HTMLElement&&!element.closest('iframe,frame')){element.focus();if(c.click===true)element.click();applied=true;}
      } else if(c?.type==='scroll'&&Number.isFinite(c.delta)&&Math.abs(c.delta)<=600) {
        window.scrollBy(0,c.delta);applied=true;
      } else if(c?.type==='text'||c?.type==='erase') {
        const field=document.activeElement;
        if(field instanceof HTMLInputElement&&['text','email','password','tel','number'].includes(field.type)&&!field.disabled&&!field.readOnly&&field.getClientRects().length) {
          const text=c.type==='erase'?'':c.text;
          if(typeof text==='string'&&text.length<=1024&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,text);
            field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));applied=true;
          }
        }
      } else if(c?.type==='tab') {
        const fields=[...document.querySelectorAll('input,button,select,a[href]')].filter(e=>e instanceof HTMLElement&&!e.disabled&&e.tabIndex>=0&&e.getClientRects().length);
        const next=fields[(fields.indexOf(document.activeElement)+1)%fields.length];if(next){next.focus();applied=true;}
      }
    }catch{/* A fixed boolean is the only input result. */}
    finally{if(request.command?.text)request.command.text='';}
    ipcRenderer.send('tv-signin-result',{id:request.id,documentId,applied});
  });
  const announce=()=>{ready=true;ipcRenderer.send('tv-signin-ready',{documentId});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',announce,{once:true});else announce();
}
