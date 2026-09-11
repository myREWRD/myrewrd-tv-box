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
  const realNow = Date.now; let now = realNow(); Date.now = () => now;
  ipcMain.emit('presentation-status', event, 'failed'); now += 4000; control.tick();
  assert.equal(control.active, true, 'brief disconnect can recover');
  ipcMain.emit('presentation-status', event, 'connected'); now += 2000; control.tick();
  assert.equal(control.active, true);
  ipcMain.emit('presentation-status', event, 'failed'); now += 5001; control.tick();
  assert.equal(first.destroyed, true); assert.equal(control.active, false); assert.equal(exits, 1);
  assert.equal(control.report.ended_session_id, state.session_id);
  assert.equal(control.reconcile(state), false, 'stale desired session must not reopen receiver');
  const next = {...state, session_id: '22222222-2222-4222-8222-222222222222'};
  assert.equal(control.reconcile(next), true);
  windows[1].emit('unresponsive'); control.tick();
  assert.equal(windows[1].destroyed, true); assert.equal(control.active, false); assert.equal(exits, 2);
  const thirdState = {...state, session_id: '33333333-3333-4333-8333-333333333333'};
  control.reconcile(thirdState); control.reconcile({desired_mode:'tv_board'});
  assert.equal(windows[2].destroyed, true); assert.equal(exits, 3);
  assert.equal(control.reconcile({...state, expires_at:new Date(0).toISOString()}), false);
  Date.now = realNow;
  const fs = require('node:fs');
  const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const policy = mainSource.slice(mainSource.indexOf('      const requested = Date.parse(data.experience.requested_at'), mainSource.indexOf('    } else if (presentation.active)'));
  const applyPolicy = new Function('data', 'config', 'saveConfig', policy);
  const requestTime = '2026-09-11T12:00:00Z', config = {};
  const makeData = (updated, ts) => ({experience:{revision:'revision',requested_at:requestTime},mode:'stream',updated_at:updated,pending_command:ts ? {type:'navigate',ts} : null});
  let data = makeData('2026-09-11T11:00:00Z'); applyPolicy(data, config, value=>Object.assign(config,value));
  assert.equal(data.mode, 'regular', 'older venue streaming must yield to board fallback');
  data = makeData('2026-09-11T13:00:00Z', Date.parse('2026-09-11T11:00:00Z')); applyPolicy(data,config,value=>Object.assign(config,value));
  assert.equal(data.mode, 'stream', 'newer settings release board ownership'); assert.equal(data.pending_command,null,'old pending command cannot replay after release');
  data = makeData('2026-09-11T11:00:00Z', Date.parse('2026-09-11T14:00:00Z')); const freshConfig={}; applyPolicy(data,freshConfig,value=>Object.assign(freshConfig,value));
  assert.equal(data.pending_command.type, 'navigate', 'new remote command still works');
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
