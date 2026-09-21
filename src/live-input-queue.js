// Coalesce hover traffic; discrete controls have a separate bounded queue.
// Rejected clicks are acknowledged, never replayed automatically.
function createLiveInputQueue(apply, acknowledge) {
  let active=false, hover=null, stopped=false;
  const commands=[];
  async function drain() {
    if(active || stopped)return;
    active=true;
    try {
      while(!stopped && (commands.length || hover)) {
        // Preserve sequence order even when a later hover replaces older moves.
        const next=commands.length && (!hover || commands[0].seq<hover.seq) ? commands.shift() : hover;
        if(next===hover)hover=null;
        let applied=false,editing,keyboard;
        try {const result=await apply(next);applied=result===true||result?.applied===true;
          if(applied&&next.command?.type==='keyboard_capabilities'&&result?.keyboard===2)keyboard=2;
          const e=result?.editing;if(applied&&next.command?.type==='edit_start'&&typeof e?.text==='string'&&e.text.length<=256&&!/[\x00-\x1f\x7f]/.test(e.text)&&Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start>=0&&e.start<=e.end&&e.end<=e.text.length)editing={text:e.text,start:e.start,end:e.end};
        } catch {}
        if(!stopped)acknowledge({seq:next.seq,applied,...(editing?{editing}:{}),...(keyboard?{keyboard}:{})});
      }
    } finally {active=false;}
  }
  return {
    push(value) {
      if(stopped || !value || !Number.isSafeInteger(value.seq))return;
      if(value.command?.type==='point' && value.command.click===false)hover=value;
      else if(commands.length<8)commands.push(value);
      else {acknowledge({seq:value.seq,applied:false});return;}
      void drain();
    },
    stop(){stopped=true;hover=null;commands.length=0;}
  };
}
if(typeof module!=='undefined')module.exports={createLiveInputQueue};
