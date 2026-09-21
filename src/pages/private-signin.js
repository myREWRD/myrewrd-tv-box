let peer,frames,closed=false,busy=false;
async function start(){
  const state=await window.tvPrivateSignIn.state();
  if(state?.kind!=='provider-sign-in')return;
  peer=new RTCPeerConnection({iceServers:state.ice_servers||[]});
  peer.ondatachannel=({channel})=>{
    if(channel.label==='private-frames'){frames=channel;return;}
    if(channel.label!=='private-controls'){channel.close();return;}
    channel.onmessage=async event=>{
      if(busy||typeof event.data!=='string'||event.data.length>8000)return;
      busy=true;
      try {const value=JSON.parse(event.data);const applied=await window.tvPrivateSignIn.input(value);if(!closed&&channel.readyState==='open')channel.send(JSON.stringify({seq:value.seq,applied}));}
      catch{/* No provider/input details in errors. */}finally{busy=false;}
    };
  };
  await peer.setRemoteDescription(state.offer);await peer.setLocalDescription(await peer.createAnswer());
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('ICE timeout')),12000);
    const changed=()=>{if(peer.iceGatheringState==='complete'){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();}};
    peer.addEventListener('icegatheringstatechange',changed);changed();
  });
  if(!await window.tvPrivateSignIn.answer(peer.localDescription.toJSON()))throw Error('Unavailable');
  while(!closed){
    if(frames?.readyState==='open'&&frames.bufferedAmount<100000){
      const frame=await window.tvPrivateSignIn.frame();
      if(frame&&frames.readyState==='open'&&frames.bufferedAmount<100000)frames.send(JSON.stringify(frame));
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
}
window.addEventListener('beforeunload',()=>{closed=true;peer?.close();});
start().catch(()=>{closed=true;peer?.close();});
