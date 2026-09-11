const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { prepareUpdate, validateArtifact, blockedVersion } = require('../src/update');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await wait(100); }
  throw Error(`Timeout: ${label}`);
}
async function run() {
  if (process.platform !== 'win32') throw Error('Windows process test required');
  require('./build-supervisor.cjs').build();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myrewrd-supervisor-'));
  const fixture = path.join(root, 'fixture.exe');
  execFileSync(path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    ['/nologo', '/target:winexe', '/r:System.Web.Extensions.dll', `/out:${fixture}`, path.join(__dirname, 'update-fixture.cs')]);
  const padded = Buffer.alloc(11 * 1024 * 1024); fs.readFileSync(fixture).copy(padded);
  const sha256 = crypto.createHash('sha256').update(padded).digest('hex');
  const valid = path.join(root, 'valid.exe'); fs.writeFileSync(valid, padded);
  validateArtifact(valid, sha256);
  assert.throws(() => validateArtifact(valid, '0'.repeat(64)), /checksum mismatch/);
  const invalid = path.join(root, 'invalid.exe'); fs.writeFileSync(invalid, Buffer.alloc(padded.length));
  assert.throws(() => validateArtifact(invalid, sha256), /Invalid update/);
  const cases = process.argv.slice(2).length ? process.argv.slice(2) : ['success', 'reverse', 'exit', 'no-ready', 'no-active', 'diagnostics-failure', 'supervisor-exit'];
  for (const mode of cases) {
    const installRoot = path.join(root, mode); fs.mkdirSync(installRoot);
    const activeSlot = mode === 'reverse' ? 'runtime-b' : 'runtime-a';
    const nextSlot = activeSlot === 'runtime-a' ? 'runtime-b' : 'runtime-a';
    fs.mkdirSync(path.join(installRoot, activeSlot));
    const previousExe = path.join(installRoot, activeSlot, 'myREWRD TV Box.exe'); fs.copyFileSync(fixture, previousExe);
    const profile = path.join(installRoot, 'profile'); fs.mkdirSync(profile);
    const startupPath = path.join(profile, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'myREWRD-TV-Box.bat');
    fs.mkdirSync(path.dirname(startupPath), { recursive: true });
    const original = Buffer.from('@echo off\r\nrem previous startup bytes\r\n'); fs.writeFileSync(startupPath, original);
    fs.writeFileSync(path.join(profile, 'config.json'), '{"synthetic":"pairing-preserved"}');
    fs.writeFileSync(path.join(installRoot, 'fixture-mode.txt'), mode === 'diagnostics-failure' ? 'exit' : mode === 'supervisor-exit' ? 'no-ready' : mode);
    const parent = spawn(previousExe, ['--original'], { cwd: installRoot, windowsHide: true, stdio: 'ignore' });
    parent.on('error', error => { throw error; });
    await until(() => fs.existsSync(path.join(installRoot, 'original.json')), 'original process', 10000);
    const identity = JSON.parse(fs.readFileSync(path.join(installRoot, 'original.json')));
    const payload = path.join(installRoot, 'archive-source'); fs.mkdirSync(path.join(payload,'resources'),{recursive:true});
    fs.copyFileSync(valid,path.join(payload,'myREWRD TV Box.exe'));
    fs.writeFileSync(path.join(payload,'resources','app.asar'),'fixture');
    fs.writeFileSync(path.join(payload,'runtime-release.json'),JSON.stringify({version:'2.0.1',layout:'installed-ab-v1'}));
    const archive=path.join(installRoot,'runtime.zip');
    const quote=value=>"'"+value.replaceAll("'","''")+"'";
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(payload)},${quote(archive)})`],{windowsHide:true});
    const archiveHash=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const savedAppData = process.env.APPDATA; process.env.APPDATA = profile;
    let job;
    try {
      job = await prepareUpdate({ version: '2.0.1', url: 'https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.2.0.1.zip',
        sha256: archiveHash, installRoot, profile, startupPath, previousExe, parentExe: previousExe, parentPid: identity.pid, parentStartedAt: identity.startedAt,
        download: async (_url, file) => fs.copyFileSync(archive, file),
      });
    } catch (error) { fs.writeFileSync(path.join(installRoot, 'shutdown'), 'exit'); throw error; }
    finally { process.env.APPDATA = savedAppData; }
    assert.deepEqual(fs.readFileSync(startupPath), original, 'Startup unchanged before old app exits');
    if (mode === 'diagnostics-failure') {
      fs.mkdirSync(path.join(job.directory, 'abort.json'));
      fs.mkdirSync(path.join(installRoot, 'update-failure.json'));
    }
    fs.writeFileSync(path.join(installRoot, 'shutdown'), 'exit');
    if (mode === 'supervisor-exit') {
      await until(() => fs.existsSync(path.join(job.directory, 'candidate.started')), 'candidate started before killing its supervisor');
      process.kill(job.supervisorPid);
    }
    await until(() => fs.existsSync(path.join(job.directory, 'result.json')), `supervisor ${mode}`);
    const result = JSON.parse(fs.readFileSync(path.join(job.directory, 'result.json')));
    if (mode === 'success' || mode === 'reverse') {
      assert.equal(result.phase, 'complete');
      await until(() => fs.existsSync(path.join(installRoot, 'success.marker')), 'activation');
      assert.ok(fs.readFileSync(startupPath, 'utf8').includes(path.join(nextSlot,'myREWRD TV Box.exe')));
    } else {
      assert.equal(result.phase, mode === 'supervisor-exit' ? 'watchdog-rollback-started' : 'rollback-started');
      await until(() => fs.existsSync(path.join(installRoot, 'rollback.marker')), 'rollback');
      assert.deepEqual(fs.readFileSync(startupPath), original, 'Exact startup restored');
      assert.equal(blockedVersion(installRoot, '2.0.1'), true);
    }
    assert.equal(fs.readFileSync(path.join(profile, 'config.json'), 'utf8'), '{"synthetic":"pairing-preserved"}');
    console.log(`PASS Windows installed A/B supervisor ${mode}: ${result.phase}, startup and profile verified`);
  }
  console.log(`Evidence: ${root}`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
