// Ephemeral live-channel input only. No clipboard, commands, selectors or field
// contents cross the boundary. Credential forms use the private account flow.
async function applyKeyboard(command,{contents,current}) {
  const text=command.type==='text'?command.text:null;
  if(command.type==='text' && (typeof text!=='string'||!text.length||text.length>256||/[\x00-\x1f\x7f]/.test(text)))return 'unavailable';
  if(command.type!=='text' && command.type!=='erase')return 'unavailable';
  const frame=contents.mainFrame,url=contents.getURL();
  if(!current())return 'unavailable';
  const code=`(() => {
    if(location.href!==${JSON.stringify(url)})return false;
    let field=document.activeElement;
    while(field?.shadowRoot?.activeElement)field=field.shadowRoot.activeElement;
    if(!field || field.disabled || field.readOnly || !field.getClientRects().length)return false;
    if(!field.matches('input[type=search],input[type=text],input:not([type]),textarea'))return false;
    if(/username|password|one-time-code|email|cc-/i.test(field.autocomplete||''))return false;
    const text=${JSON.stringify(text)},erase=${command.type==='erase'};
    const start=field.selectionStart,end=field.selectionEnd;
    if(!Number.isInteger(start)||!Number.isInteger(end))return false;
    const from=erase && start===end?Math.max(0,start-([...field.value.slice(0,start)].pop()?.length||0)):start;
    const replacement=field.value.slice(0,from)+(erase?'':text)+field.value.slice(end);
    if(field.maxLength>=0 && replacement.length>field.maxLength)return false;
    const prototype=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,replacement);
    field.setSelectionRange(from+(erase?0:text.length),from+(erase?0:text.length));
    field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:erase?'deleteContentBackward':'insertText',data:erase?null:text}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`;
  let editable=false;
  try{editable=await contents.executeJavaScriptInIsolatedWorld(1006,[{code}]);}catch{return 'unavailable';}
  if(editable!==true||!current()||contents.mainFrame!==frame||contents.getURL()!==url||contents.isLoading())return 'unavailable';
  // Validation and mutation occur atomically on the captured element above.
  // Never send native focused-target input after an asynchronous DOM check.
  return current() && contents.mainFrame===frame && contents.getURL()===url?'applied':'unavailable';
}
module.exports={applyKeyboard};
