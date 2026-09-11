const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The receiver has a separate renderer. Main-process command polling never
// waits for it, so remote exit can destroy even an unresponsive receiver.
function createPresentation({ BrowserWindow, ipcMain, apiBase, getToken, getKey, onExit }) {
  const page = path.join(__dirname, 'pages', 'presentation.html');
  let window = null, state = null, status = 'ready', pulse = 0, failedAt = 0, endedSession = null;
  const trusted = event => window && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pathToFileURL(page).href;
  function stop() {
    state = null;
    if (window && !window.isDestroyed()) window.destroy();
    window = null;
    status = 'ready'; failedAt = 0;
  }
  function reconcile(next) {
    if (!next || next.desired_mode !== 'presentation' || !/^[a-f0-9-]{36}$/i.test(next.session_id || '')
        || !(Date.parse(next.expires_at) > Date.now())) {
      if (state) { stop(); onExit(); }
      return false;
    }
    if (next.session_id === endedSession) return false;
    if (state?.session_id === next.session_id && window && !window.isDestroyed()) { window.show(); return true; }
    stop(); state = next; status = 'connecting'; pulse = Date.now();
    window = new BrowserWindow({ fullscreen: true, kiosk: true, frame: false, backgroundColor: '#071721',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
        preload: path.join(__dirname, 'presentation-preload.js') } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-redirect', event => event.preventDefault());
    window.webContents.on('render-process-gone', () => { status = 'failed'; pulse = 0; });
    window.on('unresponsive', () => { status = 'failed'; pulse = 0; });
    window.loadFile(page).catch(() => { status = 'failed'; pulse = 0; });
    return true;
  }
  ipcMain.handle('presentation-signal', async (event, answer) => {
    if (!trusted(event) || !state) throw new Error('Receiver unavailable');
    if (answer !== undefined && answer?.type !== 'restart' && (answer?.type !== 'answer' || typeof answer.sdp !== 'string' || answer.sdp.length > 60000)) throw new Error('Invalid answer');
    const session = state.session_id;
    const response = await fetch(`${apiBase}/api/tv-presentation`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ token: getToken(), device_key: getKey(), action: 'signal', session_id: session,
        ...(answer?.type === 'restart' ? { restart: true } : answer ? { answer } : {}) }) });
    if (!state || state.session_id !== session) throw new Error('Session changed');
    if (!response.ok) throw new Error('Receiver connection unavailable');
    const data = await response.json();
    return { session_id: data.session_id, offer: data.offer, has_answer: data.has_answer, ice_servers: data.ice_servers, device_name: data.device_name };
  });
  ipcMain.on('presentation-status', (event, value) => {
    if (!trusted(event) || !['ready','connecting','connected','failed','offline'].includes(value)) return;
    pulse = Date.now(); status = value;
    if (['failed', 'offline'].includes(value)) { if (!failedAt) failedAt = Date.now(); }
    else failedAt = 0;
  });
  return {
    reconcile, stop,
    tick() {
      if (!state) return;
      if (!(Date.parse(state.expires_at) > Date.now())) { stop(); onExit(); }
      else if ((failedAt && Date.now() - failedAt >= 5000) || !window || window.isDestroyed() || Date.now() - pulse > 30000) {
        endedSession = state.session_id; stop(); onExit();
      }
    },
    get active() { return Boolean(state); },
    get report() { return { ended_session_id: endedSession, reported_mode: state ? 'presentation' : 'tv_board', receiver_status: status }; },
  };
}
module.exports = { createPresentation };
