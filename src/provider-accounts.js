const {performance}=require('node:perf_hooks');
const {validJob,runHuluLogin}=require('./provider-account-login');
function createProviderAccounts({BrowserWindow,apiBase,getToken,getKey,canPoll,onPrivateStart,fetcher=(...args)=>fetch(...args),login=runHuluLogin,now=Date.now,monotonic=()=>performance.now(),diagnose=()=>{}}) {
  let request=null,active=false,generation=0;
  const seen=new Map();let history=[];
  const stages=new Set(['poll_rejected','invalid_response','invalid_job','insufficient_budget','duplicate_job','capacity_reached','private_start','private_start_failed','login_started','login_finished','report_accepted','report_rejected','cancelled','request_failed']);
  const reasons=new Set(['navigation_failed','redirect_blocked','permission_required','password_submitted','existing_session','document_blocked','verification_step','form_changed','attempt_expired','receiver_error']);
  function record(stage,reason){
    if(!stages.has(stage))return;
    history=[...history,{stage,at:new Date().toISOString(),...(reasons.has(reason)?{reason}:{})}].slice(-16);
    try{diagnose({events:history});}catch{/* Diagnostics never affect sign-in or privacy. */}
  }
  function stop(){generation++;request?.abort();active=false;}
  async function tick(){
    if(request||!canPoll()||!getToken()||!getKey())return;
    const controller=new AbortController();request=controller;
    const token=getToken(),key=getKey(),run=generation;
    const current=()=>run===generation&&!controller.signal.aborted&&token===getToken()&&key===getKey()&&canPoll();
    const headers={'Content-Type':'application/json','X-TV-Token':token,'X-TV-Presentation-Key':key};
    let timeout=setTimeout(()=>controller.abort(),10000);let job;
    const validity=setInterval(()=>{if(!current())controller.abort();},100);
    try {
      const started=monotonic();
      const response=await fetcher(`${apiBase}/api/tv-provider-accounts`,{method:'POST',headers,signal:controller.signal,redirect:'error',body:JSON.stringify({action:'poll',protocol:3})});
      if(!response.ok){record('poll_rejected');return;}
      if(!current())return;
      let raw=await response.text();if(raw.length>8192||!current()){record('invalid_response');return;}
      job=JSON.parse(raw).job;raw='';if(job===null)return;
      const received=monotonic();
      // The database's remaining lifetime, less the entire HTTP roundtrip,
      // gives a conservative deadline independent of the Windows wall clock.
      // Never fall back to local time on a protocol-3 response.
      if(!validJob(job,now(),job?.remaining_ms)){record('invalid_job');return;}
      if(!Number.isFinite(job.remaining_ms)||!Number.isFinite(received-started)||received<started){record('invalid_job');return;}
      const deadlineAt=received+job.remaining_ms-(received-started);
      const remaining=()=>deadlineAt-monotonic();
      for(const [id,expires] of seen)if(expires<=received)seen.delete(id);
      if(seen.has(job.id)){record('duplicate_job');return;}
      if(seen.size>=100){record('capacity_reached');return;}
      seen.set(job.id,received+120000);
      if(remaining()<=2000){record('insufficient_budget');return;}
      active=true;clearTimeout(timeout);
      timeout=setTimeout(()=>controller.abort(),Math.max(1,remaining()-2000));
      let reason,status;
      try{record('private_start');onPrivateStart();}catch{reason='receiver_error';status='failed';record('private_start_failed',reason);}
      if(!current()){record('cancelled');return;}
      if(!status&&remaining()<=12000){reason='attempt_expired';status='failed';record('insufficient_budget');}
      if(!status){
        const loginController=new AbortController();
        let deadline,abortLogin;
        const cancelled=Symbol('cancelled'),deadlineResult=Symbol('deadline');
        const stopped=new Promise(resolve=>{
          abortLogin=()=>{loginController.abort();resolve(cancelled);};
          controller.signal.addEventListener('abort',abortLogin,{once:true});
          deadline=setTimeout(()=>{loginController.abort();resolve(deadlineResult);},Math.max(1,remaining()-12000));
        });
        try {
          record('login_started');
          const outcome=await Promise.race([
            Promise.resolve().then(()=>login({BrowserWindow,job,signal:loginController.signal,isCurrent:()=>current()&&!loginController.signal.aborted,now,remaining,diagnose:value=>{if(reasons.has(value))reason=value;}})).catch(()=>{reason='receiver_error';return 'failed';}),
            stopped,
          ]);
          if(outcome===cancelled){record('cancelled');return;}
          if(outcome===deadlineResult){reason='attempt_expired';status='failed';}
          else status=outcome;
          record('login_finished',reason);
        }finally{
          clearTimeout(deadline);controller.signal.removeEventListener('abort',abortLogin);loginController.abort();
        }
      }
      if(!current()){record('cancelled');return;}
      const reported=await fetcher(`${apiBase}/api/tv-provider-accounts`,{method:'POST',headers,signal:controller.signal,redirect:'error',body:JSON.stringify({action:'report',protocol:3,job_id:job.id,status,...(reason?{reason}:{})})});
      let receipt='';if(reported.ok)receipt=await reported.text();
      record(reported.ok&&receipt.length<=1024&&JSON.parse(receipt).ok===true?'report_accepted':'report_rejected');
    }catch{record(controller.signal.aborted?'cancelled':'request_failed');/* Never log exceptions or replay credentials. */}
    finally {
      if(job?.credentials){job.credentials.username='';job.credentials.password='';}
      clearTimeout(timeout);clearInterval(validity);if(request===controller){request=null;active=false;}
    }
  }
  return {tick,stop,get active(){return active;}};
}
module.exports={createProviderAccounts};
