const assert = require('node:assert/strict');
const { createRemoteStatus, probeWindows, sanitize } = require('../src/remote-status');
(async () => {
  let time = 100000, token = 'fixture-token', key = null, calls = [], probes = 0;
  const sample = { host_installed: true, registration_present: true, service_state: 'running', reporter_version: '1' };
  const reporter = createRemoteStatus({ apiBase: 'https://fixture.invalid', getToken: () => token, getKey: () => key,
    now: () => time, probe: async () => { probes++; return sample; }, send: async (_url, options) => calls.push(JSON.parse(options.body)) });
  await reporter.tick(); assert.equal(probes, 0);
  key = 'a'.repeat(64); await reporter.tick(); assert.equal(calls.length, 1); assert.equal(calls[0].device_key, key);
  assert.equal(calls[0].action, 'remote_status'); await reporter.tick(); assert.equal(probes, 1);
  time += 60000; await reporter.tick(); assert.equal(probes, 2);
  let release; const pending = createRemoteStatus({ apiBase: 'https://fixture.invalid', getToken: () => token, getKey: () => key,
    probe: () => new Promise(resolve => { release = resolve; }), send: async () => { throw Error('Must not send stopped sample'); } });
  const task = pending.tick(); pending.stop(); release(sample); await task;
  let unknown;
  await createRemoteStatus({ apiBase: 'https://fixture.invalid', getToken: () => token, getKey: () => key,
    probe: async () => { throw Error('fixture access failure'); }, send: async (_url, options) => { unknown = JSON.parse(options.body); } }).tick();
  assert.equal(unknown.report.host_installed, null); assert.equal(unknown.report.service_state, 'unknown');
  let failedProbes = 0;
  const failed = createRemoteStatus({ apiBase: 'https://fixture.invalid', getToken: () => token, getKey: () => key, now: () => time,
    probe: async () => { failedProbes++; return sample; }, send: async () => { throw Error('offline'); } });
  await failed.tick(); await failed.tick(); assert.equal(failedProbes, 1); time += 60000; await failed.tick(); assert.equal(failedProbes, 2);
  await assert.rejects(probeWindows(new AbortController().signal, (_exe, args, options, callback) => {
    assert.equal(options.timeout, 15000); assert.equal(options.windowsHide, true); assert.equal(options.maxBuffer, 8192);
    assert(args.includes('-NonInteractive')); callback(Error('fixture timeout'));
  }));
  assert.deepEqual(sanitize({ ...sample, secret: 'discarded' }), sample);
  assert.throws(() => sanitize({ ...sample, service_state: 'online' }));
  console.log('PASS remote status: key required, fresh probes, no cached retries, stop cancellation, unknown failures, bounded hidden probe, sanitized payload');
})().catch(error => { console.error(error); process.exitCode = 1; });
