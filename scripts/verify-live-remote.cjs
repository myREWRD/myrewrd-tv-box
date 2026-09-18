const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const { applyRemoteCommand } = require('../src/provider-remote');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function fixture() {
  const handlers = {}, windows = [], timers = new Set();
  let now = 1000, response = { session: { id: 'fixture-session', offer: { type: 'offer', sdp: 'fixture' }, lease_ms: 8000 } };
  let fetchOverride, scans = 0, captures = 0, scan = () => false, marker = () => Promise.resolve(), allowed = true;
  const contents = new EventEmitter();
  const events = [];
  const mainFrame = { url: 'https://tv.youtube.com/watch' };
  mainFrame.framesInSubtree = [mainFrame];
  Object.assign(contents, { mainFrame, isDestroyed: () => false, isLoading: () => false,
    getURL: () => mainFrame.url, focus() {}, sendInputEvent: e => events.push(e),
    executeJavaScriptInIsolatedWorld: async (world, scripts) => world === 1001 ? marker() : scan(++scans, scripts[0].code),
    capturePage: async () => { captures++; return { getSize: () => ({ width: 1920 }), resize: () => ({ toJPEG: () => Buffer.from('jpeg') }) }; },
  });
  let view = { webContents: contents, getBounds: () => ({ width: 1920, height: 1080 }) };
  class Window {
    constructor() { this.webContents = new EventEmitter(); Object.assign(this.webContents, { mainFrame: { url: '' }, setWindowOpenHandler() {} }); windows.push(this); }
    isDestroyed() { return Boolean(this.destroyed); }
    destroy() { this.destroyed = true; }
    async loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/live-remote.js'), 'utf8');
  const context = { module: { exports: {} }, __dirname: path.join(__dirname, '../src'),
    require: name => name === 'perf_hooks' ? { performance: { now: () => now } } : name === './provider-remote' ? require('../src/provider-remote') : require(name),
    URL, AbortSignal, Buffer, setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
  };
  vm.runInNewContext(source, context);
  const remote = context.module.exports.createLiveRemote({ BrowserWindow: Window,
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, apiBase: 'https://fixture.example',
    getToken: () => 'fixture-token', getKey: () => 'fixture-key', getView: () => view, canControl: () => allowed,
    apply: (command, current) => applyRemoteCommand(command, { getView: () => view, canControl: () => current() && allowed, focus() {}, openProvider() {} }),
    fetcher: async () => fetchOverride ? fetchOverride() : { ok: true, json: async () => response },
  });
  const event = () => ({ sender: windows.at(-1).webContents, senderFrame: windows.at(-1).webContents.mainFrame });
  return { remote, handlers, windows, contents, mainFrame, events, event,
    invoke: (name, ...args) => handlers[name](event(), ...args),
    scan: fn => { scan = fn; }, marker: fn => { marker = fn; }, fetch: fn => { fetchOverride = fn; },
    advance: value => { now += value; }, captures: () => captures,
    replaceView: () => { view = { ...view }; },
  };
}

async function run(name, test) {
  const box = fixture();
  try { await test(box); console.log(`PASS ${name}`); } finally { box.remote.dispose(); }
}
(async () => {
  await run('IPC sender and main-frame boundary', async b => {
    await b.remote.tick();
    assert.ok(b.invoke('tv-live-state'));
    assert.equal(b.handlers['tv-live-state']({ ...b.event(), sender: {} }), null);
    assert.equal(b.handlers['tv-live-state']({ ...b.event(), senderFrame: { ...b.event().senderFrame } }), null);
    b.event().senderFrame.url = 'https://tv.youtube.com/';
    assert.equal(b.invoke('tv-live-state'), null);
  });
  for (const change of ['stop', 'replacement']) await run(`late poll rejected after ${change}`, async b => {
    const pending = deferred(); b.fetch(() => pending.promise);
    const tick = b.remote.tick(); await settle();
    if (change === 'stop') b.remote.stop(); else b.replaceView();
    pending.resolve({ ok: true, json: async () => ({ session: { id: 'late', offer: {}, lease_ms: 8000 } }) });
    await tick; assert.equal(b.windows.length, 0);
  });
  await run('revocation while point marker awaits prevents click', async b => {
    await b.remote.tick(); const pending = deferred(); b.marker(() => pending.promise);
    const input = b.invoke('tv-live-input', { seq: 1, command: { type: 'point', x: 0.5, y: 0.5, click: true } });
    await settle(); b.remote.stop(); pending.resolve();
    assert.equal(await input, false);
    assert.equal(b.events.filter(e => e.type === 'mouseDown' || e.type === 'mouseUp').length, 0);
  });
  await run('subframes preserve session; main navigation disconnects', async b => {
    await b.remote.tick();
    b.contents.emit('did-start-navigation', {}, 'https://fixture.example/ad', false, false);
    b.contents.emit('did-navigate-in-page', {}, 'https://fixture.example/ad#x', false);
    assert.ok(b.invoke('tv-live-state'));
    b.contents.emit('did-start-navigation', {}, 'https://tv.youtube.com/new', false, true);
    assert.equal(b.invoke('tv-live-state'), null);
    await b.remote.tick(); assert.equal(b.windows.length, 1, 'blocked session is not restarted');
  });
  await run('normal frame passes both privacy scans', async b => {
    await b.remote.tick(); let scans = 0; b.scan(() => { scans++; return false; });
    assert.equal((await b.invoke('tv-live-frame')).toString(), 'jpeg'); assert.equal(scans, 2);
  });
  for (const result of [true, undefined]) await run(`sensitive or unknown scan ${result} fails closed`, async b => {
    await b.remote.tick(); b.scan(() => result);
    assert.equal(await b.invoke('tv-live-frame'), null); assert.equal(b.captures(), 0);
  });
  await run('credential detection traverses open shadow roots', async b => {
    await b.remote.tick();
    b.scan((_n, code) => {
      const secret = { matches: () => true, getClientRects: () => [1] };
      const host = { matches: () => false, shadowRoot: { querySelectorAll: () => [secret] } };
      return vm.runInNewContext(code, { document: { querySelectorAll: () => [host] } });
    });
    assert.equal(await b.invoke('tv-live-frame'), null); assert.equal(b.captures(), 0);
  });
  await run('sensitive child frame blocks capture', async b => {
    await b.remote.tick();
    b.mainFrame.framesInSubtree.push({ url: 'https://fixture.example/form', executeJavaScript: async () => true });
    assert.equal(await b.invoke('tv-live-frame'), null); assert.equal(b.captures(), 0);
  });
  await run('credential appearing after capture suppresses frame', async b => {
    await b.remote.tick(); b.scan(n => n === 2);
    assert.equal(await b.invoke('tv-live-frame'), null); assert.equal(b.captures(), 1);
  });
  await run('revocation during final privacy scan suppresses frame', async b => {
    await b.remote.tick(); const pending = deferred(); b.scan(n => n === 2 ? pending.promise : false);
    const frame = b.invoke('tv-live-frame'); await settle(); b.remote.stop(); pending.resolve(false);
    assert.equal(await frame, null);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
