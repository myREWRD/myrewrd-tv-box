// Search-only, session-bound editing over the ephemeral live data channel.
// No HTTP, clipboard, desktop input or credential-field access.
async function editSearch(command,{contents,current,sessionId}) {
  if(!command||!['edit_start','edit_update','edit_end','edit_submit'].includes(command.type)||!/^[a-f0-9-]{36}$/i.test(command.edit_id||''))return false;
  if(command.type==='edit_update'&&(typeof command.text!=='string'||command.text.length>256||/[\x00-\x1f\x7f]/.test(command.text)||!Number.isInteger(command.start)||!Number.isInteger(command.end)||command.start<0||command.start>command.end||command.end>command.text.length))return false;
  if(!current())return false;
  const frame=contents.mainFrame,url=contents.getURL();
  const payload={type:command.type,id:command.edit_id,session:sessionId,...(command.type==='edit_update'?{text:command.text,start:command.start,end:command.end}:{})};
  const code=`(() => {
    if(location.href!==${JSON.stringify(url)})return false;
    const c=${JSON.stringify(payload)},key='__myrewrdSearchEditor';
    if(c.type==='edit_end'){if(globalThis[key]?.id===c.id&&globalThis[key]?.session===c.session)delete globalThis[key];return true;}
    let focused=document.activeElement;
    while(focused?.shadowRoot?.activeElement)focused=focused.shadowRoot.activeElement;
    const field=c.type==='edit_start'?focused:globalThis[key]?.field.deref();
    if(!field||field!==focused||!field.isConnected||field.disabled||field.readOnly||!field.getClientRects().length)return false;
    if(!field.matches('input[type=search],input[type=text],input:not([type])'))return false;
    if(/username|password|one-time-code|email|cc-/i.test(field.autocomplete||''))return false;
    const search=field.type==='search'||field.getAttribute('role')==='searchbox'||/search|query/i.test([field.name,field.id,field.getAttribute('aria-label'),field.placeholder].join(' '));
    if(!search)return false;
    const sensitive=root=>[...root.querySelectorAll('*')].some(e=>(e.matches('input[type=password],input[type=email],input[autocomplete=username],input[autocomplete=one-time-code]')&&e.getClientRects().length>0)||(e.shadowRoot&&sensitive(e.shadowRoot)));
    if(sensitive(document))return false;
    if(c.type==='edit_start'){
      if(field.value.length>256||/[\\x00-\\x1f\\x7f]/.test(field.value)||!Number.isInteger(field.selectionStart)||!Number.isInteger(field.selectionEnd))return false;
      globalThis[key]={id:c.id,session:c.session,field:new WeakRef(field)};
      return {applied:true,editing:{text:field.value,start:field.selectionStart,end:field.selectionEnd}};
    }
    if(globalThis[key]?.id!==c.id||globalThis[key]?.session!==c.session)return false;
    if(c.type==='edit_submit'){if(!field.form)return false;HTMLFormElement.prototype.requestSubmit.call(field.form);return true;}
    if(field.maxLength>=0&&c.text.length>field.maxLength)return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,c.text);
    field.setSelectionRange(c.start,c.end);
    field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:c.text}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`;
  let result;try{result=await contents.executeJavaScriptInIsolatedWorld(1007,[{code}]);}catch{return false;}
  if(!current()||contents.mainFrame!==frame||contents.getURL()!==url||contents.isLoading())return false;
  return result;
}
module.exports={editSearch};
