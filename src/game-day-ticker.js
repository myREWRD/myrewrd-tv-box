// Fetch only the existing public, venue-scoped ticker projection. No credentials reach the renderer.
function createGameDayTicker({fetch, getToken, publish, apiBase}) {
  let messages=[], activeToken=null, generation=0;
  return {
    current(){return getToken()===activeToken ? messages : [];},
    async refresh(){
      const token=getToken(), request=++generation;
      if(token!==activeToken){messages=[];activeToken=token;publish(messages);}
      if(!token)return;
      try{
        const response=await fetch(`${apiBase}/api/tv-ticker?token=${encodeURIComponent(token)}`,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Unavailable');
        const data=await response.json();
        if(!data.ok || !Array.isArray(data.messages))throw new Error('Invalid feed');
        const next=data.messages.filter(m=>m && typeof m.id==='string' && typeof m.message==='string' && m.message.trim()).slice(0,100).map(m=>({id:m.id,message:m.message.slice(0,200)}));
        if(request!==generation || token!==getToken())return;
        messages=next;publish(messages);
      }catch{
        if(request!==generation || token!==getToken())return;
        messages=[];publish(messages);
      }
    }
  };
}
module.exports={createGameDayTicker};
