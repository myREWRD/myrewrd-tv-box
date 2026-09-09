// Test-package entry only. Production package.json never references this file.
const electron = require('electron');
const { app, session, net, BrowserWindow } = electron;
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const settings = JSON.parse(fs.readFileSync(process.env.TV_BOX_TEST_SETTINGS, 'utf8'));
app.setPath('userData', settings.profile);
app.setPath('sessionData', settings.profile);
app.disableHardwareAcceleration();
const version = app.getVersion();
const record = (kind, value) => fs.writeFileSync(path.join(settings.root, `${version}.${kind}.json`), JSON.stringify(value));
record('started', { pid: process.pid, at: Date.now() });
app.on('before-quit', () => record('quitting', { at: Date.now() }));
app.whenReady().then(async () => {
  session.defaultSession.protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.pathname === '/api/tv-box-command') {
      record('heartbeat', { at: Date.now() });
      let update = {}; try { update = JSON.parse(fs.readFileSync(path.join(settings.root, 'offer.json'))); } catch {}
      return Response.json({ mode: update.latest_version ? settings.mode || 'regular' : 'regular', stream_url: 'https://tv.youtube.com/live', ...update });
    }
    if (url.pathname.startsWith('/api/')) return Response.json({ ok: true });
    if (settings.failCandidate && version === '1.0.6') return Response.error();
    return new Response('<!doctype html><title>Isolated TV board</title><h1>TV board fixture</h1>', { headers: { 'content-type': 'text/html' } });
  });
  if (version === (settings.originalVersion || '1.0.5') && !fs.existsSync(path.join(settings.root, 'seeded'))) {
    await session.defaultSession.cookies.set({ url: 'https://tv.youtube.com', name: 'test-session', value: 'preserved', secure: true, expirationDate: Date.now()/1000 + 3600 });
    await session.defaultSession.cookies.flushStore();
    fs.writeFileSync(path.join(settings.root, 'seeded'), 'yes');
  }
  global.fetch = (url, options) => net.fetch(url, options);
  const HiddenWindow = new Proxy(BrowserWindow, {
    construct(Target, [options]) {
      const win = new Target({ ...options, show: false });
      win.show = () => { record('shown', { at: Date.now() }); }; win.focus = () => {};
      win.webContents.on('did-finish-load', async () => {
        if (!win.webContents.getURL().includes('/tv/tv_')) return;
        try {
          if (version === (settings.originalVersion || '1.0.5')) await win.webContents.executeJavaScript("localStorage.setItem('test-persistence','preserved')");
          const value = await win.webContents.executeJavaScript("localStorage.getItem('test-persistence')");
          const cookies = await session.defaultSession.cookies.get({ url: 'https://tv.youtube.com', name: 'test-session' });
          record('board', { at: Date.now(), localStorage: value, cookie: cookies[0]?.value });
          session.defaultSession.flushStorageData();
        } catch {}
      });
      return win;
    },
  });
  const original = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'electron') return { ...electron, BrowserWindow: HiddenWindow };
    if (name === 'node:https' || name === 'https') return { get: (_url, callback) => http.get(settings.downloadUrl, callback) };
    return original.call(this, name, ...args);
  };
  require('./src/main.js');
  // Exit only these isolated test instances when the runner is finished.
  const stop = setInterval(() => { if (fs.existsSync(path.join(settings.root, 'stop'))) { clearInterval(stop); app.quit(); } }, 100);
}).catch(error => { record('error', { error: error.message }); app.exit(1); });
