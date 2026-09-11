const video = document.getElementById('screen');
const waiting = document.getElementById('waiting');
const label = document.getElementById('status');
let peer = null, status = 'ready', busy = false, pendingAnswer = null, answerDelivered = false;
function show(value, text) { status = value; label.textContent = text; window.presentation.status(status); }
function reset() { if (peer) peer.close(); peer = null; answerDelivered = false; video.srcObject = null; video.hidden = true; waiting.hidden = false; }
function gathered(connection) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('ICE timeout')); }, 15000);
    const changed = () => { if (connection.iceGatheringState === 'complete') { cleanup(); resolve(); } };
    function cleanup() { clearTimeout(timeout); connection.removeEventListener('icegatheringstatechange', changed); }
    connection.addEventListener('icegatheringstatechange', changed); changed();
  });
}
async function poll() {
  if (busy) return;
  busy = true;
  try {
    const data = await window.presentation.signal();
    document.getElementById('device').textContent = data.device_name || 'myREWRD TV';
    if (pendingAnswer) { await window.presentation.signal(pendingAnswer); pendingAnswer = null; answerDelivered = true; }
    if (data.has_answer && !peer) {
      await window.presentation.signal({ type: 'restart' });
      show('ready', 'Ready to reconnect. Select Share this screen on your laptop.');
      return;
    }
    if (data.offer && !peer) {
      show('connecting', 'Connecting your screen…');
      peer = new RTCPeerConnection({ iceServers: data.ice_servers || [] });
      const connection = peer;
      connection.ontrack = event => {
        event.track.onended = () => show('failed', 'Sharing ended. Returning to TV Board...');
        event.track.onmute = () => show('failed', 'Sharing interrupted. Returning to TV Board...');
        event.track.onunmute = () => show('connected', 'Presenting');
        video.srcObject = event.streams[0] || new MediaStream([event.track]); video.hidden = false; waiting.hidden = true; video.play().catch(() => show('failed', 'Unable to play. Relaunch Presentation Mode.')); };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') {
          if (video.srcObject) { video.hidden = false; waiting.hidden = true; }
          show('connected', 'Presenting');
        }
        if (['failed','closed','disconnected'].includes(connection.connectionState)) {
          video.hidden = true; waiting.hidden = false;
          show('failed', 'Presenter disconnected. Returning to TV Board...');
        }
      };
      await connection.setRemoteDescription(data.offer);
      await connection.setLocalDescription(await connection.createAnswer());
      await gathered(connection);
      pendingAnswer = connection.localDescription.toJSON();
      await window.presentation.signal(pendingAnswer); pendingAnswer = null; answerDelivered = true;
    } else if (!data.offer) show('ready', 'Ready to present');
    else if (peer?.connectionState === 'connected' && video.srcObject?.getVideoTracks().some(track => track.readyState === 'live' && !track.muted)) show('connected', 'Presenting');
  } catch { if (!pendingAnswer && !answerDelivered) reset(); show('offline', 'Connection interrupted. Reconnecting…'); }
  finally { busy = false; }
}
setInterval(() => window.presentation.status(status), 2000);
setInterval(poll, 3000);
window.addEventListener('beforeunload', reset);
poll();
