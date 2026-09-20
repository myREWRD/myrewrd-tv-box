const {validJob,runHuluLogin}=require('./provider-account-login');
function createProviderAccounts({BrowserWindow,apiBase,getToken,getKey,canPoll,onPrivateStart,fetcher=(...args)=>fetch(...args),login=runHuluLogin,now=Date.now}) {
  let request=null,active=false,generation=0;
  const seen=new Map();
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
      const response=await fetcher(`${apiBase}/api/tv-provider-accounts`,{method:'POST',headers,signal:controller.signal,redirect:'error',body:JSON.stringify({action:'poll',protocol:2})});
      if(!response.ok||!current())return;
      let raw=await response.text();if(raw.length>8192||!current())return;
      job=JSON.parse(raw).job;raw='';if(!validJob(job,now()))return;
      for(const [id,expires] of seen)if(expires<=now())seen.delete(id);
      if(seen.has(job.id)||seen.size>=100)return;
      seen.set(job.id,Date.parse(job.expires_at));
      active=true;onPrivateStart();clearTimeout(timeout);
      timeout=setTimeout(()=>controller.abort(),Math.max(1,Date.parse(job.expires_at)-now()-2000));
      // Keep the delivery lifetime separate from the private browser deadline.
      // Electron script execution can wait indefinitely for a provider page to
      // finish loading. Abort destroys that window synchronously, then leaves
      // time to report the outcome without replaying its credentials.
      const loginController=new AbortController();
      let reason,deadline,abortLogin;
      const cancelled=Symbol('cancelled');
      const deadlineResult=Symbol('deadline');
      const stopped=new Promise(resolve=>{
        abortLogin=()=>{loginController.abort();resolve(cancelled);};
        controller.signal.addEventListener('abort',abortLogin,{once:true});
        deadline=setTimeout(()=>{loginController.abort();resolve(deadlineResult);},Math.max(1,Date.parse(job.expires_at)-now()-12000));
      });
      let status;
      try {
        const outcome=await Promise.race([
          Promise.resolve().then(()=>login({BrowserWindow,job,signal:loginController.signal,isCurrent:()=>current()&&!loginController.signal.aborted,now,diagnose:value=>{if(['navigation_failed','redirect_blocked','permission_required','password_submitted','existing_session','document_blocked','verification_step','form_changed','attempt_expired','receiver_error'].includes(value))reason=value;}})).catch(()=>{reason='receiver_error';return 'failed';}),
          stopped,
        ]);
        if(outcome===cancelled)return;
        if(outcome===deadlineResult){reason='attempt_expired';status='failed';}
        else status=outcome;
      }finally{
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort',abortLogin);
        loginController.abort();
      }
      if(!current())return;
      await fetcher(`${apiBase}/api/tv-provider-accounts`,{method:'POST',headers,signal:controller.signal,redirect:'error',body:JSON.stringify({action:'report',protocol:2,job_id:job.id,status,...(reason?{reason}:{})})});
    }catch{/* No secret-bearing exception text and no automatic credential replay. */}
    finally {
      if(job?.credentials){job.credentials.username='';job.credentials.password='';}
      clearTimeout(timeout);clearInterval(validity);if(request===controller){request=null;active=false;}
    }
  }
  return {tick,stop,get active(){return active;}};
}
module.exports={createProviderAccounts};
