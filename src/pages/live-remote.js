let peer, frames, closed=false;
async function start() {
  const state=await window.tvLive.state();
  if (!state) return;
  peer=new RTCPeerConnection({iceServers:state.ice_servers || []});
  peer.ondatachannel=({channel})=>{
    if (channel.label==='frames') {frames=channel;return;}
    if (channel.label!=='controls') {channel.close();return;}
    let queue=Promise.resolve(), pending=0;
    channel.onmessage=event=>{
      if (typeof event.data!=='string' || event.data.length>1024) return;
      if(pending>=5)return;pending++;
      queue=queue.then(async()=>{try {
        const value=JSON.parse(event.data);
        const applied=await window.tvLive.input(value);
        if (channel.readyState==='open' && channel.bufferedAmount<4096) channel.send(JSON.stringify({seq:value.seq,applied}));
      } catch { /* Invalid input is ignored. */ } finally {pending--;} });
    };
  };
  await peer.setRemoteDescription(state.offer);
  await peer.setLocalDescription(await peer.createAnswer());
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('ICE timeout')),12000);
    const changed=()=>{if(peer.iceGatheringState==='complete'){clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',changed);resolve();}};
    peer.addEventListener('icegatheringstatechange',changed);changed();
  });
  if (!await window.tvLive.answer(peer.localDescription.toJSON())) throw Error('Answer unavailable');
  while (!closed) {
    if (frames?.readyState==='open' && frames.bufferedAmount<60000) {
      const frame=await window.tvLive.frame();
      if (frame && frames.readyState==='open' && frames.bufferedAmount<60000) frames.send(new Uint8Array(frame));
    }
    await new Promise(resolve=>setTimeout(resolve,125));
  }
}
window.addEventListener('beforeunload',()=>{closed=true;peer?.close();});
start().catch(()=>{closed=true;peer?.close();});
