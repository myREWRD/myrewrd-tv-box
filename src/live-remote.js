const path = require('path');
const { performance } = require('perf_hooks');
const { providerPage } = require('./provider-remote');

function previewPage(url) {
  if (!providerPage(url)) return false;
  return !/(?:login|signin|sign-in|signup|sign-up|account|auth|checkout|payment|billing|activate)/i.test(new URL(url).pathname);
}
function createLiveRemote({ BrowserWindow, ipcMain, apiBase, getToken, getKey, getView, canControl, apply, fetcher = (...args) => fetch(...args) }) {
  let window = null, session = null, lease = 0, polling = false, view = null, blocked = null, generation = 0;
  let capturing = false, lastCapture = 0, sequence = -1, count = 0, bucket = 0, applying = false;
  const file = path.join(__dirname,'pages','live-remote.html');
  const valid = () => Boolean(session && performance.now()<lease && canControl() && view===getView() && view && !view.webContents.isDestroyed() && previewPage(view.webContents.getURL()));
  function navigation(_event,_url,_inPlace,isMainFrame) { if (isMainFrame !== false) stop(); }
  function inPage(_event,_url,isMainFrame) { if (isMainFrame !== false) stop(); }
  function stop() {
    generation++;
    if (session) blocked = session.id;
    session = null; lease = 0;
    if (window && !window.isDestroyed()) window.destroy();
    window = null;
    if (view && !view.webContents.isDestroyed()) { view.webContents.removeListener('did-start-navigation',navigation); view.webContents.removeListener('did-navigate-in-page',inPage); view.webContents.removeListener('render-process-gone',stop); }
    view = null;
  }
  function trusted(event) { return window && !window.isDestroyed() && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && event.senderFrame.url===require('url').pathToFileURL(file).href && valid(); }
  async function request(body) {
    const response = await fetcher(`${apiBase}/api/tv-live-remote`, {method:'POST',headers:{'Content-Type':'application/json','X-TV-Token':getToken(),'X-TV-Presentation-Key':getKey()}, body:JSON.stringify({action:'device',...body}),signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw Error('Unavailable');
    return response.json();
  }
  ipcMain.handle('tv-live-state', event => trusted(event) ? session : null);
  ipcMain.handle('tv-live-answer', async (event, answer) => {
    if (!trusted(event) || answer?.type!=='answer' || typeof answer.sdp!=='string' || answer.sdp.length>60000) return false;
    const id = session.id;
    try { await request({session_id:id,answer}); return session?.id===id && valid(); } catch { return false; }
  });
  ipcMain.handle('tv-live-frame', async event => {
    if (!trusted(event) || capturing || performance.now()-lastCapture<120) return null;
    capturing = true; lastCapture = performance.now();
    const target = view, id = session.id;
    try {
      // Check every frame and open shadow root. Only a boolean crosses this boundary.
      // Account names/menus may be visible in provider previews; no credential values are read.
      const check = async () => {
        const frames = target.webContents.mainFrame.framesInSubtree;
        if (frames.length > 50) return true;
        const results = await Promise.all(frames.map(async frame => {
          if (/(?:login|signin|sign-in|signup|account|auth|checkout|payment|billing|activate)/i.test(frame.url)) return true;
          const code = `(() => { const scan = root => [...root.querySelectorAll('*')].some(e =>
            (e.matches('input[type=password],input[type=email],input[autocomplete=username],input[autocomplete=one-time-code]') && e.getClientRects().length > 0)
            || (e.shadowRoot && scan(e.shadowRoot))); return scan(document); })()`;
          const result = frame === target.webContents.mainFrame
            ? await target.webContents.executeJavaScriptInIsolatedWorld(1002,[{code}]) : await frame.executeJavaScript(code);
          return typeof result !== 'boolean' || result;
        }));
        return results.some(Boolean);
      };
      const sensitive = await check();
      if (sensitive || !valid() || session?.id!==id) { stop(); return null; }
      const image = await target.webContents.capturePage();
      const sensitiveAfter = await check();
      if (sensitiveAfter || !valid() || session?.id!==id || target!==view) return null;
      const resized = image.resize({width:Math.min(960,image.getSize().width)});
      let jpeg = resized.toJPEG(45);
      if (jpeg.length>60000) jpeg = image.resize({width:640}).toJPEG(30);
      return jpeg.length<=60000 ? jpeg : null;
    } catch { stop(); return null; }
    finally { capturing = false; }
  });
  ipcMain.handle('tv-live-input', async (event, envelope) => {
    if (!trusted(event) || applying || !envelope || !Number.isSafeInteger(envelope.seq) || envelope.seq<=sequence) return false;
    const now = performance.now();
    if (now-bucket>=1000) { bucket=now; count=0; }
    if (++count>35) return false;
    sequence=envelope.seq;
    const command=envelope.command;
    if (!command || !['point','key','scroll','back','reload','mute'].includes(command.type)) return false;
    applying=true;
    const id = session.id;
    try { return await apply(command, () => valid() && session?.id===id)==='applied'; } finally { applying=false; }
  });
  async function tick() {
    if (polling || !canControl() || !getToken() || !getKey()) { if (!canControl()) stop(); return; }
    polling=true;
    const started=performance.now(), token=getToken(), key=getKey(), run=generation, target=getView();
    try {
      const data=await request({});
      if (run!==generation || target!==getView()) return;
      if (token!==getToken() || key!==getKey() || !canControl()) { stop(); return; }
      const next=data.session;
      if (!next?.offer || next.id===blocked) { stop(); return; }
      if (session?.id!==next.id) {
        stop(); blocked=null; session=next; view=getView(); sequence=-1;
        if (!view || !previewPage(view.webContents.getURL())) { stop(); return; }
        lease=started+Math.min(8000,Number(next.lease_ms)||0);
        view.webContents.on('did-start-navigation',navigation); view.webContents.on('did-navigate-in-page',inPage); view.webContents.on('render-process-gone',stop);
        window=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,partition:'tv-live-remote',preload:path.join(__dirname,'live-remote-preload.js')}});
        window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        window.webContents.on('will-navigate',e=>e.preventDefault());
        window.webContents.on('render-process-gone',stop);
        window.loadFile(file).catch(stop);
      } else lease=started+Math.min(8000,Number(next.lease_ms)||0);
    } catch { /* The local watchdog expires the last successful lease. */ }
    finally { polling=false; }
  }
  const watchdog=setInterval(()=>{if (session && !valid()) stop();},100);
  const timer=setInterval(tick,3000);
  return {tick,stop,dispose(){clearInterval(timer);clearInterval(watchdog);stop();}};
}
module.exports={createLiveRemote,previewPage};
