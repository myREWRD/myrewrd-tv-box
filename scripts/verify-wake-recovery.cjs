const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { tokenFromBoardUrl, createRecovery } = require('../src/recovery');
const { allowedNavigation } = require('../src/navigation');
const base = 'https://app.myrewrd.com';
const token = 'tv_0123456789abcdef'; // synthetic fixture only
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

function boot(saved) {
  const timers = new Map(); let nextTimer = 1;
  const files = new Map(saved ? [[path.join('/fixture', 'config.json'), JSON.stringify(saved)]] : []);
  const logs = []; const requests = []; const windows = [];
  const app = Object.assign(new EventEmitter(), {
    getPath: () => '/fixture', getVersion: () => '1.0.4',
    commandLine: { appendSwitch() {} }, whenReady: () => Promise.resolve(), quit() {},
    requestSingleInstanceLock: () => true, exit() {},
  });
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.urls = []; this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: '' }, send() {}, reload() {},
        setWindowOpenHandler: handler => { this.popupHandler = handler; },
        getURL: () => this.webContents.mainFrame.url,
        destroy() {}, loadURL: (url) => this.loadURL(url),
      });
      windows.push(this);
    }
    loadURL(url) { this.urls.push(url); this.webContents.mainFrame.url = url; return Promise.resolve(); }
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    show() {} restore() {} setKiosk(v) { this.kiosk = v; }
    setFullScreen(v) { this.fullscreen = v; } focus() {}
    addBrowserView() {} removeBrowserView() {} setBounds() {} setAutoResize() {}
    static getAllWindows() { return windows.filter(w => !w.destroyed); }
  }
  const ipcMain = new EventEmitter(); ipcMain.handlers = {};
  ipcMain.handle = (key, fn) => { ipcMain.handlers[key] = fn; };
  const powerMonitor = new EventEmitter();
  const context = vm.createContext({
    require(name) {
      if (name === 'electron') return { app, BrowserWindow: Window, BrowserView: Window, ipcMain, powerMonitor, screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) } };
      if (name === 'fs') return {
        existsSync: p => files.has(p), readFileSync: p => files.get(p),
        mkdirSync() {}, writeFileSync: (p, data) => files.set(p, data),
      };
      if (name === './recovery') return { tokenFromBoardUrl, createRecovery: opts => createRecovery({ ...opts, setTimer: context.setTimeout, clearTimer: context.clearTimeout }) };
      if (name === './sponsor') return require('../src/sponsor');
      if (name === './navigation') return require('../src/navigation');
      if (name === './update') return require('../src/update');
      return require(name);
    },
    __dirname: path.join(__dirname, '../src'), URL, AbortController,
    process: Object.assign(new EventEmitter(), { execPath: '/fixture/app.exe', env: {}, platform: 'win32' }),
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, delay, interval: true }); return id; },
    clearInterval: id => timers.delete(id),
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: false }; },
  });
  vm.runInContext(source, context);
  return { context, windows, files, timers, requests, logs, powerMonitor, ipcMain,
    run: text => vm.runInContext(text, context),
    fire(delay) { for (const [id, t] of [...timers]) if (!t.interval && t.delay === delay) { timers.delete(id); t.fn(); } },
  };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

(async () => {
  for (const value of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'http://youtube.com', 'https://youtube.com.evil.example', 'https://user:secret@youtube.com', `${base}/dashboard`, 'https://127.0.0.1']) {
    assert.equal(allowedNavigation(value, base, token), false);
  }
  for (const value of [`${base}/tv/${token}`, `${base}/tv/pair`, 'https://tv.youtube.com/live', 'https://accounts.google.com/signin', 'https://www.hulu.com/live-tv']) {
    assert.equal(allowedNavigation(value, base, token), true);
  }
  const paired = boot({ paired: true, tvToken: token }); await settle();
  assert.equal(paired.windows[0].urls.at(-1), `${base}/tv/${token}`);
  paired.powerMonitor.emit('resume'); paired.powerMonitor.emit('unlock-screen');
  assert.equal([...paired.timers.values()].filter(t => t.delay === 1000).length, 1);
  paired.fire(1000); await settle();
  assert.equal(paired.windows[0].urls.length, 2);
  assert.equal(paired.windows[0].kiosk, true);
  assert.equal(paired.windows[0].popupHandler({ url: 'https://evil.example' }).action, 'deny');
  const popup = paired.windows[0].popupHandler({ url: 'https://accounts.google.com/signin' });
  assert.equal(popup.action, 'allow');
  assert.ok(popup.overrideBrowserWindowOptions.webPreferences.preload.endsWith('provider-preload.js'));
  assert.equal(popup.overrideBrowserWindowOptions.webPreferences.nodeIntegration, false);
  assert.equal([...paired.timers.values()].filter(t => t.interval && t.delay === 5000).length, 1);

  // Offline/failed top-level load retries the saved board; iframe errors do not.
  paired.windows[0].webContents.emit('did-fail-load', {}, -105, 'offline', '', false);
  assert.equal([...paired.timers.values()].filter(t => t.delay === 15000).length, 0);
  paired.windows[0].webContents.emit('did-fail-load', {}, -105, 'offline', '', true);
  paired.fire(15000); await settle();
  assert.equal(paired.windows[0].urls.at(-1), `${base}/tv/${token}`);
  paired.windows[0].webContents.emit('did-navigate', {}, `${base}/tv/${token}`, 503);
  assert.equal([...paired.timers.values()].filter(t => t.delay === 15000).length, 1);
  paired.fire(15000); await settle();
  paired.windows[0].webContents.emit('render-process-gone', {}, {});
  paired.fire(5000); await settle();
  assert.equal(paired.windows[0].urls.at(-1), `${base}/tv/${token}`);

  // PIN pairing is a Next.js in-page transition; untrusted/subframe URLs cannot pair.
  const fresh = boot(); await settle();
  const wc = fresh.windows[0].webContents;
  assert.equal(fresh.windows[0].urls[0], `${base}/tv/pair`);
  let blocked = false;
  wc.emit('will-navigate', { preventDefault() { blocked = true; } }, `${base}/tv/${token}`);
  assert.equal(blocked, false, 'canonical full-page pairing must be allowed');
  wc.emit('will-navigate', { preventDefault() { blocked = true; } }, `https://evil.example/tv/${token}`);
  assert.equal(blocked, true, 'foreign full-page pairing must be blocked');
  for (const url of [`https://evil.example/tv/${token}`, `${base}.evil.example/tv/${token}`, `${base}/tv/${token}/extra`]) {
    wc.emit('did-navigate-in-page', {}, url, true);
    assert.equal(fresh.run('config.paired'), false);
  }
  wc.emit('did-navigate-in-page', {}, `${base}/tv/${token}`, false);
  assert.equal(fresh.run('config.paired'), false);
  wc.emit('did-navigate-in-page', {}, `${base}/tv/${token}`, true); await settle();
  const stored = JSON.parse(fresh.files.get(path.join('/fixture', 'config.json')));
  assert.equal(stored.tvToken, token);
  const relaunched = boot(stored); await settle();
  assert.equal(relaunched.windows[0].urls[0], `${base}/tv/${token}`);
  assert.ok(!JSON.stringify(fresh.logs).includes(token));
  assert.equal(fresh.ipcMain.handlers['get-config']().tvToken, undefined);

  const unpaired = boot(); await settle();
  const uwc = unpaired.windows[0].webContents;
  const trusted = { sender: uwc, senderFrame: uwc.mainFrame };
  for (const event of [
    { sender: {}, senderFrame: uwc.mainFrame },
    { sender: uwc, senderFrame: { url: `${base}/tv/pair` } },
  ]) {
    unpaired.ipcMain.emit('pair-with-token', event, token);
    assert.equal(unpaired.run('config.paired'), false);
  }
  uwc.mainFrame.url = 'https://evil.example';
  unpaired.ipcMain.emit('pair-with-token', trusted, token);
  assert.equal(unpaired.run('config.paired'), false);
  uwc.mainFrame.url = `${base}/tv/pair`;
  unpaired.ipcMain.emit('pair-with-token', trusted, token); await settle();
  assert.equal(unpaired.run('config.paired'), true);
  uwc.mainFrame.url = 'https://evil.example';
  unpaired.ipcMain.emit('switch-mode', trusted, 'gameday', {});
  assert.equal(unpaired.run('currentMode'), 'regular');

  // Server modes still win after wake; failed Game Day stream retries automatically.
  let active = false;
  fresh.context.fetch = async url => ({ ok: true, json: async () => url.includes('/api/tv-game?')
    ? { ok: true, active: active ? { display: {} } : null }
    : url.includes('/api/tv-box-command?') ? { mode: 'gameday', stream_url: 'https://tv.youtube.com' } : {} });
  fresh.powerMonitor.emit('resume'); fresh.fire(1000); await settle();
  assert.equal(fresh.run('currentMode'), 'gameday');
  const oldStream = fresh.run('streamView');
  fresh.run('streamView.webContents.emit("did-fail-load", {}, -105, "offline", "", true)');
  assert.equal([...fresh.timers.values()].filter(t => t.delay === 15000).length, 1);
  fresh.fire(15000); await settle();
  assert.equal(fresh.run('currentMode'), 'gameday');
  assert.notEqual(fresh.run('streamView'), oldStream);
  assert.equal(fresh.run('streamView').urls.at(-1), 'https://tv.youtube.com');
  active = true; await fresh.run('pollForCommands()'); await settle();
  assert.equal(fresh.run('currentMode'), 'live-game');
  active = false; await fresh.run('pollForCommands()'); await settle();
  assert.equal(fresh.run('currentMode'), 'gameday');

  // Unpair invalidates in-flight work and pending recovery; wake never resurrects it.
  paired.run('handleCommand({ type: "unpair" })'); await settle();
  paired.powerMonitor.emit('resume'); paired.fire(1000); await settle();
  assert.equal(paired.windows[0].urls.at(-1), `${base}/tv/pair`);
  assert.equal(paired.run('config.tvToken'), null);

  // A hung pre-sleep request is aborted; its eventual stale response cannot change mode.
  let release;
  relaunched.context.fetch = (_url, options) => new Promise(resolve => { release = resolve; });
  relaunched.run('pollForCommands()'); await settle();
  const oldController = relaunched.run('pollController');
  relaunched.powerMonitor.emit('suspend');
  assert.equal(oldController.signal.aborted, true);
  release({ ok: true, json: async () => ({ mode: 'gameday' }) }); await settle();
  assert.equal(relaunched.run('currentMode'), 'regular');
  console.log('Wake recovery: cold start, SPA pairing, origin checks, resume coalescing, offline/503/crash retry, polling, stale response, unpair, and token privacy passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
