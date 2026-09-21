function credentialStepCode(step,value,provider='hulu',username='') {
  if(!['email','password'].includes(step))throw Error('Unsupported login step');
  if(provider==='peacock')return `(() => {
    if(location.origin!=='https://www.peacocktv.com'||location.pathname!==${JSON.stringify(step==='email'?'/start':'/signin')}||window!==window.top)return 'unsupported';
    const field=document.querySelector(${JSON.stringify(step==='email'?'input#email[name="email"][type="text"]':'input#password[name="password"][type="password"]')});
    const buttons=[...(field?.closest('form')?.querySelectorAll('button')||[])].filter(b=>b.type==='submit'&&b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(step==='email'?'Continue':'Sign In')});
    if(!field||!field.getClientRects().length||field.disabled||buttons.length!==1)return 'not_ready';
    const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
    ${step==='password'?`const email=document.querySelector('input#userIdentifier[name="userIdentifier"][type="text"]');if(!email||!email.getClientRects().length||email.disabled)return 'unsupported';set(email,${JSON.stringify(username)});`:''}
    set(field,${JSON.stringify(value)});
    if(buttons[0].disabled)return 'not_ready';buttons[0].click();return 'submitted';
  })()`;
  const selector=step==='email'?'input#email-field[type="email"]':'input#password[type="password"]';
  const button=step==='email'?'Continue':'Log In';
  return `(() => {
    if(location.origin!=='https://auth.hulu.com'||location.pathname!==${JSON.stringify('/web/login/enter-'+step)}||window!==window.top)return 'unsupported';
    const field=document.querySelector(${JSON.stringify(selector)});
    if(!field||field.getClientRects().length!==1||field.disabled)return 'not_ready';
    const buttons=[...document.querySelectorAll('button[type="submit"]')].filter(b=>b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(button)});
    if(buttons.length!==1)return 'not_ready';
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
    if(buttons[0].disabled)return 'not_ready';buttons[0].click();return 'submitted';
  })()`;
}

// This preload belongs only to the hidden provider-account window. No API is
// exposed to the provider page or to ordinary TV remote viewers.
if (process.type === 'renderer') {
  const {ipcRenderer,webFrame}=require('electron');
  if (process.isMainFrame) {
    const documentId=crypto.randomUUID();let ready=false,busy=false;
    const results=new Set(['submitted','not_ready','unsupported']);
    ipcRenderer.on('tv-private-form-request',async (_event,request)=>{
      if (!ready||busy||!request||request.documentId!==documentId
        ||!['hulu','peacock'].includes(request.provider)||!['email','password'].includes(request.step)
        ||typeof request.id!=='string'||!/^[a-f0-9-]{36}$/i.test(request.id)
        ||typeof request.value!=='string'||request.value.length>1024
        ||typeof request.username!=='string'||request.username.length>320)return;
      busy=true;let result='unsupported';
      try {
        const answer=await webFrame.executeJavaScriptInIsolatedWorld(1005,[{code:credentialStepCode(request.step,request.value,request.provider,request.username)}],true);
        if(results.has(answer))result=answer;
      }catch{/* Never expose provider errors or field contents. */}
      finally{request.value='';request.username='';busy=false;}
      ipcRenderer.send('tv-private-form-result',{id:request.id,documentId,result});
    });
    const announce=()=>{ready=true;ipcRenderer.send('tv-private-form-ready',{documentId});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',announce,{once:true});else announce();
  }
} else module.exports={credentialStepCode};
