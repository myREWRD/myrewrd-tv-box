// Run with Electron, not Node. Uses real Chromium, IPC, navigation events,
// disk-backed sessions and renderer processes. Network is fully intercepted.
const electron = require('electron');
const { app, BrowserWindow, session, powerMonitor, net } = electron;
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const profile = path.resolve(process.argv[2]);
const phase = process.argv[3] || 'first';
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.setName('myREWRD isolated integration test');
const base = 'https://app.myrewrd.com';
const token = 'tv_0123456789abcdef';
let mode = 'regular'; let offline = false; let boardLoads = 0;
const events = [];
const deadline = setTimeout(() => { console.error('Integration deadline exceeded'); app.exit(1); }, 100000);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await check()) return; } catch {} await wait(100); }
  throw Error(`Timed out: ${label}`);
}
function pass(label) { events.push(label); console.log(`PASS ${label}`); }

app.whenReady().then(async () => {
  session.defaultSession.protocol.handle('https', request => {
    const url = new URL(request.url);
    if (offline) return Response.error();
    if (url.origin === base && url.pathname === '/api/tv-box-command') return Response.json({ mode, stream_url: 'https://tv.youtube.com/live' });
    if (url.origin === base && url.pathname.startsWith('/api/')) return Response.json({ ok: true });
    if (url.origin === base && url.pathname === `/tv/${token}`) boardLoads++;
    const text = url.pathname === '/tv/pair' ? 'Pair device' : url.origin === base ? 'Venue TV board' : 'Provider fixture';
    return new Response(`<!doctype html><title>${text}</title><body style="background:#112233;color:white;font:40px sans-serif"><h1>${text}</h1></body>`, { headers: { 'content-type': 'text/html' } });
  });
  // Node-side API polling also goes through isolated Chromium protocol fixtures.
  global.fetch = (url, options) => net.fetch(url, options);
  const originalLoad = Module._load;
  const HiddenWindow = new Proxy(BrowserWindow, {
    construct(Target, [options]) {
      const window = new Target({ ...options, show: false });
      window.show = () => {}; window.focus = () => {};
      return window;
    },
  });
  Module._load = function(name, ...args) {
    if (name === 'electron') return { ...electron, BrowserWindow: HiddenWindow };
    return originalLoad.call(this, name, ...args);
  };
  require('../src/main.js');
  Module._load = originalLoad;
  await until(() => BrowserWindow.getAllWindows().length === 1, 'window created');
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  if (phase === 'first') {
    await until(() => wc.getURL() === `${base}/tv/pair` && !wc.isLoading(), 'pairing page');
    await wc.executeJavaScript(`history.replaceState({}, '', '/tv/${token}')`);
    await until(() => fs.existsSync(path.join(profile, 'config.json')), 'SPA pairing saved');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'config.json'))).tvToken, token);
    pass('real in-page pairing event persisted to AppData');
    await wc.loadURL(`${base}/tv/${token}`);
    await wc.executeJavaScript("localStorage.setItem('fixture-preference', 'saved')");
    await session.defaultSession.cookies.set({ url: 'https://tv.youtube.com', name: 'fixture-session', value: 'saved', expirationDate: Date.now() / 1000 + 3600, secure: true });
    await session.defaultSession.cookies.flushStore();
    session.defaultSession.flushStorageData();
    pass('real persistent cookie and local storage written');
  } else {
    await until(() => wc.getURL() === `${base}/tv/${token}` && !wc.isLoading(), 'cold relaunch board');
    assert.equal(await wc.executeJavaScript("localStorage.getItem('fixture-preference')"), 'saved');
    const cookies = await session.defaultSession.cookies.get({ url: 'https://tv.youtube.com', name: 'fixture-session' });
    assert.equal(cookies[0]?.value, 'saved');
    pass('cold relaunch restored board, local storage, and streaming cookie');

    await wc.loadURL('https://tv.youtube.com/live');
    const exposed = await wc.executeJavaScript('window.tvBox.getConfig()');
    assert.equal(exposed.tvToken, undefined);
    await wc.executeJavaScript("window.tvBox.switchMode('gameday', {})");
    await wait(300); assert.equal(win.getBrowserView(), null);
    powerMonitor.emit('resume'); powerMonitor.emit('unlock-screen');
    await until(() => wc.getURL() === `${base}/tv/${token}` && !wc.isLoading(), 'wake route');
    assert.equal(win.isKiosk(), true); assert.equal(win.isFullScreen(), true);
    pass('real IPC rejects provider commands; wake restores board and kiosk');

    const previousLoads = boardLoads;
    offline = true; powerMonitor.emit('suspend'); powerMonitor.emit('resume');
    await wait(2500); offline = false;
    await until(() => boardLoads > previousLoads && !wc.isLoading(), 'network recovery', 25000);
    pass('offline wake automatically recovered after network returned');

    mode = 'gameday';
    await until(() => win.getBrowserView() && !win.getBrowserView().webContents.isLoading(), 'Game Day');
    const oldStream = win.getBrowserView();
    oldStream.webContents.forcefullyCrashRenderer();
    await until(() => win.getBrowserView() && win.getBrowserView() !== oldStream && !win.getBrowserView().webContents.isLoading(), 'stream renderer recovery');
    assert.equal(win.getBrowserView().webContents.getURL(), 'https://tv.youtube.com/live');
    pass('Game Day renderer crash recreated real BrowserView and provider page');

    mode = 'regular';
    await until(() => !win.getBrowserView() && wc.getURL() === `${base}/tv/${token}`, 'regular mode');
    const beforeCrash = boardLoads;
    wc.forcefullyCrashRenderer();
    await until(() => boardLoads > beforeCrash && !wc.isLoading(), 'board renderer recovery');
    pass('board renderer crash recovered without login');
    await wc.executeJavaScript("location.href='https://evil.example/'");
    await wait(500); assert.equal(wc.getURL(), `${base}/tv/${token}`);
    pass('real navigation guard blocked an unapproved destination');
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify({ phase, events }, null, 2));
  }
  clearTimeout(deadline);
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
