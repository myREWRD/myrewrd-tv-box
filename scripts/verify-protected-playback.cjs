const assert = require('node:assert/strict');
const { createProtectedPlayback } = require('../src/protected-playback');
const { boot, settle } = require('./verify-wake-recovery.cjs');
const saved = { paired: true, tvToken: 'tv_0123456789abcdef' };
const url = 'https://tv.youtube.com/live';

(async () => {
  await assert.rejects(createProtectedPlayback({}).ready(), /runtime unavailable/);
  let finish, calls = 0;
  const components = { WIDEVINE_CDM_ID: 'fixture-widevine', whenReady(ids) {
    assert.deepEqual(ids, ['fixture-widevine']); calls++;
    return new Promise(resolve => { finish = resolve; });
  } };
  const box = boot(saved, components); await settle();
  assert.equal(box.run('currentMode'), 'regular', 'component download never blocks the board');
  box.run(`switchMode('gameday', {streamUrl: '${url}'})`); await settle();
  const view = box.run('streamView');
  assert.equal(view.urls.length, 0, 'do not load provider until Widevine is ready');
  assert.equal(view.options.webPreferences.sandbox, true);
  assert.equal(view.options.webPreferences.nodeIntegration, false);
  assert.equal(view.options.webPreferences.preload, undefined, 'provider has no device preload');
  assert.equal(view.options.webPreferences.disableHtmlFullscreenWindowResize, true);
  box.run("handleCommand({type: 'set_stream_url', url: 'https://tv.youtube.com/new'})"); await settle();
  finish([]); await settle();
  assert.equal(calls, 1, 'concurrent requests share component initialization');
  assert.deepEqual(view.urls, ['https://tv.youtube.com/new'], 'stale URL cannot win');
  box.run("handleCommand({type: 'navigate', url: 'https://evil.example'})"); await settle();
  assert.deepEqual(view.urls, ['https://tv.youtube.com/new'], 'navigation allowlist preserved');
  view.webContents.mainFrame.url = 'https://tv.youtube.com/watch/selected-game';
  box.run("handleCommand({type: 'refresh'})"); await settle();
  assert.equal(view.urls.at(-1), 'https://tv.youtube.com/watch/selected-game', 'refresh preserves selected channel');

  for (const mode of ['regular', 'live-game']) {
    let resolve;
    const other = boot(saved, { ...components, whenReady: () => new Promise(r => { resolve = r; }) });
    await settle(); other.run(`switchMode('gameday', {streamUrl: '${url}'})`); await settle();
    const stale = other.run('streamView');
    other.run(`switchMode('${mode}')`); resolve([]); await settle();
    assert.equal(stale.urls.length, 0, 'late readiness cannot reopen playback after mode change');
    assert.equal(other.run('currentMode'), mode);
  }

  let attempts = 0;
  const retry = boot(saved, { ...components, whenReady: async () => {
    if (++attempts === 1) throw Error('fixture private provider detail'); return [];
  } });
  await settle(); retry.run(`switchMode('gameday', {streamUrl: '${url}'})`); await settle();
  assert.equal(retry.run('streamView').lastFile.options.hash, 'retry');
  assert.equal(retry.run('boardStatus'), 'failed');
  assert.ok(!JSON.stringify(retry.logs).includes('private provider detail'));
  retry.fire(60000); await settle();
  assert.equal(retry.run('streamView').urls.at(-1), url, 'failed installation retries');
  assert.equal(retry.run('boardStatus'), 'connecting', 'recovered preparation clears failure without claiming video playback');

  let complete;
  const hung = boot(saved, { ...components, whenReady: () => new Promise(r => { complete = r; }) });
  await settle(); hung.run(`switchMode('gameday', {streamUrl: '${url}'})`); await settle();
  hung.fire(30000); await settle();
  assert.equal(hung.run('streamView').lastFile.options.hash, 'retry');
  hung.run("handleCommand({type:'unpair'})");
  hung.fire(60000); complete([]); await settle();
  assert.equal(hung.run('streamView'), null, 'unpair cancels delayed playback');
  assert.equal(hung.run('config.tvToken'), null);
  console.log('PASS protected playback readiness, timeout/retry, stale navigation, mode takeover, unpair and provider isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
