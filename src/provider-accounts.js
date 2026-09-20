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
      let reason;
      const status=await login({BrowserWindow,job,signal:controller.signal,isCurrent:current,now,diagnose:value=>{if(['navigation_failed','redirect_blocked','permission_required','password_submitted','existing_session','document_blocked','verification_step','form_changed','attempt_expired','receiver_error'].includes(value))reason=value;}});
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
