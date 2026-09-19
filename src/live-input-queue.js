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
        let applied=false;
        try {applied=await apply(next)===true;} catch {}
        if(!stopped)acknowledge({seq:next.seq,applied});
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
