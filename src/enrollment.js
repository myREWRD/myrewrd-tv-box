const path = require('node:path');
const { createHash } = require('node:crypto');
const codeFor = (keyHash, id) => createHash('sha256').update(`myrewrd-receiver-enrollment-v1:${id}:${keyHash}`).digest('hex').slice(0, 12).toUpperCase();

function createEnrollment({ BrowserWindow, apiBase, getToken, ensureKey, fetcher = (...args) => fetch(...args) }) {
  let state = null, window = null, busy = false, registered = false;
  function stop() {
    state = null; registered = false;
    if (window && !window.isDestroyed()) window.destroy();
    window = null;
  }
  function reconcile(next) {
    if (!next || !/^[a-f0-9-]{36}$/.test(next.id || '') || !(Date.parse(next.expires_at) > Date.now())) { stop(); return; }
    if (state?.id !== next.id) { stop(); state = next; }
    const key = ensureKey();
    if (!key) { stop(); return; } // Never fall back to plaintext storage.
    const hash = createHash('sha256').update(key).digest('hex');
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({ fullscreen: true, kiosk: true, frame: false, backgroundColor: '#071721',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', event => event.preventDefault());
      window.webContents.on('will-redirect', event => event.preventDefault());
      window.webContents.on('render-process-gone', () => { if (window && !window.isDestroyed()) window.destroy(); });
      window.on('unresponsive', () => { if (window && !window.isDestroyed()) window.destroy(); });
      window.loadFile(path.join(__dirname, 'pages', 'enrollment.html'), { query: { code: codeFor(hash, next.id), expires: next.expires_at } }).catch(() => {});
    }
    if (busy || registered) return;
    const attempt = state; busy = true;
    fetcher(`${apiBase}/api/tv-presentation`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000), body: JSON.stringify({ token: getToken(), action: 'enroll', enrollment_id: next.id, key_hash: hash }) })
      .then(response => { if (state === attempt && response.ok) registered = true; })
      .catch(() => {}) // Existing poll retries after transient network loss.
      .finally(() => { busy = false; });
  }
  return { reconcile, stop, tick() { if (state && !(Date.parse(state.expires_at) > Date.now())) stop(); } };
}
module.exports = { createEnrollment, codeFor };
