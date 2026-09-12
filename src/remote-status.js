const path = require('node:path');
const { execFile } = require('node:child_process');
const UNKNOWN = { host_installed: null, registration_present: null, service_state: 'unknown', reporter_version: '1' };
function sanitize(value) {
  if (!value || ![true, false, null].includes(value.host_installed)
    || ![true, false, null].includes(value.registration_present)
    || !['running', 'stopped', 'missing', 'unknown'].includes(value.service_state)
    || value.reporter_version !== '1') throw Error('Invalid status');
  return { host_installed: value.host_installed, registration_present: value.registration_present,
    service_state: value.service_state, reporter_version: '1' };
}
function probeWindows(signal, execute = execFile) {
  return new Promise((resolve, reject) => {
    const scriptRoot = __dirname.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
    execute(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptRoot, 'remote-status.ps1')],
      { windowsHide: true, timeout: 15000, maxBuffer: 8192, signal }, (error, stdout) => {
        if (error) { reject(Error('Probe unavailable')); return; }
        try { resolve(sanitize(JSON.parse(stdout))); } catch { reject(Error('Probe unavailable')); }
      });
  });
}
function createRemoteStatus({ apiBase, getToken, getKey, canReport = () => true,
  probe = probeWindows, send = (...args) => fetch(...args), now = Date.now }) {
  let busy = false, next = 0, controller = null;
  async function tick() {
    if (busy || now() < next || !canReport()) return;
    const token = getToken(), key = getKey();
    if (!token || !/^[a-f0-9]{64}$/.test(key || '')) return;
    const started = now();
    busy = true; next = started + 60000;
    const request = new AbortController(); controller = request;
    const deadline = setTimeout(() => request.abort(), 25000);
    try {
      let sample;
      try { sample = sanitize(await probe(request.signal)); } catch { sample = { ...UNKNOWN }; }
      // A stopped/repaired/unpaired device must not send an earlier identity's sample.
      if (request.signal.aborted || now() - started > 25000 || !canReport() || token !== getToken() || key !== getKey()) return;
      await send(`${apiBase}/api/tv-presentation`, { method: 'POST', signal: request.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, device_key: key, action: 'remote_status', report: sample }) });
    } catch { /* No cached retry, secret output, or coupling to command polling. */ }
    finally { clearTimeout(deadline); if (controller === request) controller = null; busy = false; }
  }
  function stop() { controller?.abort(); next = 0; }
  return { tick, stop };
}
module.exports = { createRemoteStatus, probeWindows, sanitize };
