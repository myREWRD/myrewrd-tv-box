const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fixtureRoot = path.resolve(process.argv[2]);
const failCandidate = process.argv.includes('--fail-candidate');
const legacy = process.argv.includes('--legacy');
const originalVersion = legacy ? '1.0.4' : '1.0.5';
if (legacy && failCandidate) throw Error('Legacy has no rollback supervisor; do not claim recovery');
const root = path.join(fixtureRoot, `run-${Date.now()}`); fs.mkdirSync(root);
const profile = path.join(root, 'profile'); fs.mkdirSync(profile);
const token = 'tv_0123456789abcdef';
fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ paired: true, tvToken: token }));
const startupPath = path.join(profile, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'myREWRD-TV-Box.bat');
fs.mkdirSync(path.dirname(startupPath), { recursive: true });
const old = path.join(root, `myREWRD.TV.Box.${originalVersion}.exe`);
fs.copyFileSync(path.join(fixtureRoot, originalVersion, 'dist', `myREWRD TV Box ${originalVersion}.exe`), old);
const prior = `@echo off\r\nstart "" "${old}"\r\n`; fs.writeFileSync(startupPath, prior);
const bytes = fs.readFileSync(process.argv.includes('--bridge-probe') ? path.join(fixtureRoot, 'bridge-probe.exe')
  : path.join(fixtureRoot, '1.0.6', 'dist', 'myREWRD TV Box 1.0.6.exe'));
const server = http.createServer((_req, res) => { res.writeHead(200); res.end(bytes); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await wait(200); }
  throw Error(`Timeout: ${label}; evidence ${root}`);
}
function read(file) { try { return JSON.parse(fs.readFileSync(file)); } catch { return null; } }
server.listen(0, '127.0.0.1', async () => {
  const settingsFile = path.join(root, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ root, profile, originalVersion, failCandidate, mode: process.argv.includes('--gameday') ? 'gameday' : 'regular', downloadUrl: `http://127.0.0.1:${server.address().port}/candidate` }));
  try {
    const launch = spawn(old, [], { cwd: root, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, APPDATA: profile, TV_BOX_TEST_SETTINGS: settingsFile } });
    launch.on('error', error => { fs.writeFileSync(path.join(root, 'launch-error'), error.code || 'unknown'); });
    launch.on('exit', (code, signal) => fs.writeFileSync(path.join(root, 'launcher-exit.json'), JSON.stringify({ code, signal })));
    await until(() => read(path.join(root, `${originalVersion}.board.json`))?.cookie === 'preserved', 'original paired board');
    fs.writeFileSync(path.join(root, 'offer.json'), JSON.stringify({ latest_version: '1.0.6',
      update_url: 'https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.1.0.6.exe',
      update_sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
    if (legacy) {
      await until(() => read(path.join(root, '1.0.6.board.json'))?.cookie === 'preserved', 'legacy-to-candidate board');
      await until(() => read(path.join(root, '1.0.6.heartbeat.json')), 'legacy-to-candidate heartbeat');
      assert.equal(read(path.join(root, '1.0.6.board.json')).localStorage, 'preserved');
      assert.ok(fs.readFileSync(startupPath, 'utf8').includes('myREWRD.TV.Box.1.0.6.exe'));
      assert.equal(read(path.join(profile, 'config.json')).tvToken, token);
      console.log(`PASS legacy 1.0.4 packaged handoff on this Windows host; not a rollback guarantee. Evidence ${root}`);
      return;
    }
    await until(() => fs.existsSync(path.join(root, '.updates')), 'transaction staged');
    let job;
    await until(() => { job = fs.readdirSync(path.join(root, '.updates')).map(n => path.join(root, '.updates', n)).find(n => read(path.join(n, 'result.json'))); return job; }, 'supervisor result');
    const result = read(path.join(job, 'result.json'));
    assert.equal(result.phase, failCandidate ? 'rollback-started' : 'complete');
    if (failCandidate) {
      const failedAt = fs.statSync(path.join(job, 'abort.json')).mtimeMs;
      await until(() => read(path.join(root, '1.0.5.heartbeat.json'))?.at > failedAt, 'previous packaged app restarted');
      assert.equal(fs.readFileSync(startupPath, 'utf8'), prior);
    } else {
      await until(() => read(path.join(root, '1.0.6.board.json'))?.cookie === 'preserved', 'replacement board and cookie');
      assert.equal(read(path.join(root, '1.0.6.board.json')).localStorage, 'preserved');
      assert.ok(fs.readFileSync(startupPath, 'utf8').includes('myREWRD.TV.Box.1.0.6.exe'));
    }
    assert.equal(read(path.join(profile, 'config.json')).tvToken, token);
    console.log(`PASS actual Windows portable ${failCandidate ? 'rollback' : 'upgrade'}: paired board, startup, cookie/local storage; isolated network fixtures. Evidence ${root}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { fs.writeFileSync(path.join(root, 'stop'), 'stop'); server.close(); }
});
