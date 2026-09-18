const path = require('path');
const { performance } = require('perf_hooks');
const { providerPage } = require('./provider-remote');
const { hiddenChildFramesCode } = require('./preview-frame-visibility');

function previewPage(url) {
  if (!providerPage(url)) return false;
  return !/(?:login|signin|sign-in|signup|sign-up|account|auth|checkout|payment|billing|activate)/i.test(new URL(url).pathname);
}
function createLiveRemote({ BrowserWindow, ipcMain, apiBase, getToken, getKey, getView, canControl, apply, diagnose = () => {}, fetcher = (...args) => fetch(...args) }) {
  let window = null, session = null, lease = 0, polling = false, view = null, blocked = null, generation = 0;
  let capturing = false, lastCapture = 0, sequence = -1, count = 0, bucket = 0, applying = false;
  const file = path.join(__dirname,'pages','live-remote.html');
  const valid = () => Boolean(session && performance.now()<lease && canControl() && view===getView() && view && !view.webContents.isDestroyed() && previewPage(view.webContents.getURL()));
  function navigation(_event,_url,_inPlace,isMainFrame) { if (isMainFrame !== false) stop('navigation'); }
  function inPage(_event,_url,isMainFrame) { if (isMainFrame !== false) stop('navigation'); }
  function stop(reason = 'stopped', detail = {}) {
    if (session) {
      const reasons = ['stopped','navigation','lease-expired','view-unavailable','frame-limit','sensitive-frame-url','sensitive-input','unknown-scan','frame-exception','capture-failed'];
      const record = { reason: reasons.includes(reason) ? reason : 'stopped', at: new Date().toISOString() };
      if (['pre-scan','capture','post-scan'].includes(detail.stage)) record.stage = detail.stage;
      if (Number.isInteger(detail.frameCount)) record.frameCount = Math.min(10000,Math.max(0,detail.frameCount));
      if (typeof detail.mainFrame === 'boolean') record.mainFrame = detail.mainFrame;
      try { diagnose(record); } catch { /* Diagnostics cannot change the security boundary. */ }
    }
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
    let main, tree, identities;
    const sameTree = () => {
      if (!valid() || session?.id!==id || target.webContents.mainFrame!==main) return false;
      const current = main.framesInSubtree;
      return current.length===identities.length && identities.every((entry,index) => {
        const frame=current[index];
        return frame===entry.frame && !frame.detached && !frame.isDestroyed?.() && frame.frameToken===entry.token
          && frame.processId===entry.process && frame.routingId===entry.routing && frame.url===entry.url;
      });
    };
    let stage = 'pre-scan';
    try {
      main = target.webContents.mainFrame;
      tree = main.framesInSubtree;
      identities = tree.map(frame => ({ frame, token:frame.frameToken, process:frame.processId, routing:frame.routingId, url:frame.url }));
      // Check every frame and open shadow root. Only a boolean crosses this boundary.
      // Account names/menus may be visible in provider previews; no credential values are read.
      const check = async () => {
        if (!sameTree()) throw { reason:'frame-exception', stage };
        const frames = tree;
        if (frames.length > 50) throw { reason:'frame-limit', stage, frameCount:frames.length };
        let hiddenChildren = false;
        if (frames.length > 1) {
          const geometry = await target.webContents.executeJavaScriptInIsolatedWorld(1002,[{code:hiddenChildFramesCode}]);
          if (!sameTree()) throw { reason:'frame-exception', stage };
          hiddenChildren = geometry?.hidden===true && Number.isInteger(geometry.count) && geometry.count===main.frames?.length;
        }
        const inspected = hiddenChildren ? [main] : frames;
        const results = await Promise.all(inspected.map(async frame => {
          const detail = { stage, frameCount:frames.length, mainFrame:frame===target.webContents.mainFrame };
          if (/(?:login|signin|sign-in|signup|account|auth|checkout|payment|billing|activate)/i.test(frame.url)) throw { reason:'sensitive-frame-url', ...detail };
          const code = `(() => { const scan = root => [...root.querySelectorAll('*')].some(e =>
            (e.matches('input[type=password],input[type=email],input[autocomplete=username],input[autocomplete=one-time-code]') && e.getClientRects().length > 0)
            || (e.shadowRoot && scan(e.shadowRoot))); return scan(document); })()`;
          let result;
          try { result = frame === target.webContents.mainFrame
            ? await target.webContents.executeJavaScriptInIsolatedWorld(1002,[{code}]) : await frame.executeJavaScript(code); }
          catch { throw { reason:'frame-exception', ...detail }; }
          if (typeof result !== 'boolean' || result) throw { reason:typeof result === 'boolean' ? 'sensitive-input' : 'unknown-scan', ...detail };
          return false;
        }));
        if (!sameTree()) throw { reason:'frame-exception', stage };
        return results.some(Boolean);
      };
      const sensitive = await check();
      if (sensitive || !valid() || session?.id!==id) { stop(); return null; }
      stage = 'capture';
      const image = await target.webContents.capturePage();
      stage = 'post-scan';
      const sensitiveAfter = await check();
      if (sensitiveAfter || !sameTree() || target!==view) return null;
      const resized = image.resize({width:Math.min(960,image.getSize().width)});
      let jpeg = resized.toJPEG(45);
      if (jpeg.length>60000) jpeg = image.resize({width:640}).toJPEG(30);
      return jpeg.length<=60000 ? jpeg : null;
    } catch (error) { stop(error?.reason || 'capture-failed', { ...error, stage }); return null; }
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
  const watchdog=setInterval(()=>{if (session && !valid()) stop(performance.now()>=lease ? 'lease-expired' : 'view-unavailable');},100);
  const timer=setInterval(tick,3000);
  return {tick,stop,dispose(){clearInterval(timer);clearInterval(watchdog);stop();}};
}
module.exports={createLiveRemote,previewPage};
