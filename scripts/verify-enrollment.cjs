const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { ensurePresentationKey, loadPresentationKey } = require('../src/presentation-key');
const { createEnrollment, codeFor } = require('../src/enrollment');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-enrollment-test-'));
const options = { profile: root, installDir: root, safeStorage: { isEncryptionAvailable:()=>true,
  encryptString:s=>Buffer.from(s.split('').reverse().join('')), decryptString:b=>b.toString().split('').reverse().join('') } };
const key = ensurePresentationKey(options);
assert.match(key,/^[a-f0-9]{64}$/);assert.equal(loadPresentationKey(options),key);
assert.equal(ensurePresentationKey(options),key,'restart preserves generated key');
assert.notEqual(fs.readFileSync(path.join(root,'presentation-key.enc'),'utf8'),key);
assert.equal(ensurePresentationKey({...options,profile:path.join(root,'blocked'),safeStorage:{isEncryptionAvailable:()=>false}}),null);
fs.mkdirSync(path.join(root,'corrupt'));fs.writeFileSync(path.join(root,'corrupt','presentation-key.enc'),'bad');
assert.equal(ensurePresentationKey({...options,profile:path.join(root,'corrupt')}),null,'cannot overwrite unreadable key');
const windows=[];
class Window extends EventEmitter {
  constructor(config) { super();this.config=config;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=fn=>{this.open=fn};windows.push(this); }
  isDestroyed(){return !!this.destroyed} destroy(){this.destroyed=true}
  loadFile(file,args){this.file=file;this.args=args;return Promise.resolve()}
}
let calls=0, payload;
const control=createEnrollment({BrowserWindow:Window,apiBase:'https://example.test',getToken:()=> 'fixture-token',ensureKey:()=>key,
  fetcher:async(_url,options)=>{calls++;payload=JSON.parse(options.body);if(calls===1)throw Error('offline');return {ok:true}}});
const session={id:crypto.randomUUID(),expires_at:new Date(Date.now()+600000).toISOString()};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  control.reconcile(session);await flush();control.reconcile(session);await flush();
  assert.equal(calls,2,'network failure retries');assert.equal(windows.length,1);
  assert(!Object.values(payload).includes(key),'private key never sent during enrollment');
  assert.equal(payload.key_hash,crypto.createHash('sha256').update(key).digest('hex'));
  assert.equal(windows[0].args.query.code,codeFor(payload.key_hash,session.id));
  assert.equal(windows[0].config.webPreferences.sandbox,true);assert.equal(windows[0].open().action,'deny');
  control.reconcile(session);await flush();assert.equal(calls,2,'accepted claim not repeatedly written');
  const next={...session,id:crypto.randomUUID()};control.reconcile(next);await flush();
  assert.equal(windows[0].destroyed,true);assert.notEqual(windows[0].args.query.code,windows[1].args.query.code,'visual code changes with session');
  windows[1].emit('unresponsive');control.reconcile(next);assert.equal(windows.length,3,'frozen overlay recreated');
  control.reconcile(null);assert.equal(windows[2].destroyed,true,'cancel/approval closes overlay');
  control.reconcile({...session,expires_at:new Date(0).toISOString()});assert.equal(windows.length,3,'expired setup never opens');
  console.log('PASS device enrollment: encrypted persistence, no plaintext fallback/overwrite, hash-only registration, retry, session-bound code, sandbox, cancel/expiry and frozen-window recovery');
})().catch(e=>{console.error(e);process.exit(1)});
