const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createPresentation } = require('../src/presentation');
const windows = [];
class Window extends EventEmitter {
  constructor() { super(); this.destroyed = false; this.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler() {} }); windows.push(this); }
  loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; return Promise.resolve(); }
  destroy() { this.destroyed = true; }
  show() {}
  isDestroyed() { return this.destroyed; }
}
const ipcMain = new EventEmitter();
const handlers = {}; ipcMain.handle = (name, fn) => { handlers[name] = fn; };
let exits = 0;
const control = createPresentation({ BrowserWindow: Window, ipcMain, apiBase: 'https://example.test', getToken: () => 'fixture', getKey: () => 'fixture-key', onExit: () => exits++ });
const state = { desired_mode: 'presentation', session_id: '11111111-1111-4111-8111-111111111111', expires_at: new Date(Date.now() + 60000).toISOString() };
(async () => {
  assert.equal(control.reconcile(null), false);
  assert.equal(control.reconcile({ ...state, session_id: 'bad' }), false);
  assert.equal(control.reconcile(state), true);
  const first = windows[0];
  control.reconcile(state); assert.equal(windows.length, 1);
  const event = { sender: first.webContents, senderFrame: first.webContents.mainFrame };
  ipcMain.emit('presentation-status', event, 'connected');
  assert.equal(control.report.receiver_status, 'connected');
  ipcMain.emit('presentation-status', { sender: {}, senderFrame: {} }, 'failed');
  assert.equal(control.report.receiver_status, 'connected');
  await assert.rejects(handlers['presentation-signal']({ sender: {}, senderFrame: {} }), /unavailable/);
  let request;
  global.fetch = async (url, options) => { request = JSON.parse(options.body); return { ok: true, json: async () => ({ device_name: 'Demo', offer: null, ice_servers: [] }) }; };
  await handlers['presentation-signal'](event);
  assert.equal(request.device_key, 'fixture-key');
  assert.equal(request.session_id, state.session_id);
  first.emit('unresponsive'); control.tick();
  assert.equal(first.destroyed, true); assert.equal(windows.length, 2);
  // Remote exit destroys an unhealthy receiver without an IPC response.
  control.reconcile({ desired_mode: 'tv_board' });
  assert.equal(windows[1].destroyed, true); assert.equal(control.active, false); assert.equal(exits, 1);
  assert.equal(control.reconcile({ ...state, expires_at: new Date(0).toISOString() }), false);
  control.reconcile(state);
  const third = windows[2];
  control.stop(); assert.equal(third.destroyed, true);
  const fs = require('node:fs');
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'presentation-key-test-'));
  const { loadPresentationKey } = require('../src/presentation-key');
  const key = 'a'.repeat(64);
  const storage = { isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from([...value].reverse().join('') + '-fixture-cipher'),
    decryptString: value => value.toString().replace('-fixture-cipher', '').split('').reverse().join('') };
  fs.writeFileSync(path.join(root, 'presentation-key.json'), JSON.stringify({ key }));
  assert.equal(loadPresentationKey({ safeStorage: storage, profile: root, installDir: root }), key);
  assert.equal(fs.existsSync(path.join(root, 'presentation-key.json')), false);
  assert.equal(loadPresentationKey({ safeStorage: storage, profile: root, installDir: root }), key);
  assert.equal(loadPresentationKey({ safeStorage: { isEncryptionAvailable: () => false }, profile: root, installDir: root }), null);
  fs.unlinkSync(path.join(root, 'presentation-key.enc')); fs.rmdirSync(root);
  console.log('Presentation controller: desired state, idempotence, authenticated IPC, watchdog, expiry, and remote exit passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
