const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { slotFor, stageRuntime, assertPlainTree } = require('./installed-runtime');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function mark(job, name, phase) {
  fs.writeFileSync(path.join(job.directory, name), JSON.stringify({ nonce: job.nonce, version: job.version, phase }));
}
function hasMark(job, name, phase) {
  const value = read(path.join(job.directory, name));
  return value?.nonce === job.nonce && value?.version === job.version && value?.phase === phase;
}
function blockedVersion(installRoot, version) {
  if (read(path.join(installRoot, 'update-failure.json'))?.version === version) return true;
  // An interrupted transaction is also a failed attempt, even if disk errors
  // prevented writing its failure record. Never automatically replay it.
  const transactions = path.join(installRoot, '.updates');
  try {
    if (!fs.existsSync(transactions)) return false;
    return fs.readdirSync(transactions).some(nonce => {
      if (!/^[a-f0-9]{32}$/.test(nonce)) return false;
      const directory = path.join(transactions, nonce);
      const manifest = read(path.join(directory, 'manifest.json'));
      if (!manifest) return true;
      if (manifest.phase === 'staging') return false; // No process handoff occurred; network failures may retry.
      return manifest.version === version && !hasMark({ ...manifest, directory }, 'complete.json', 'complete');
    });
  } catch { return true; }
}
function validateArtifact(file, expectedHash) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash || '')) throw Error('Update checksum missing');
  const bytes = fs.readFileSync(file);
  if (bytes.length < 10 * 1024 * 1024 || bytes.toString('ascii', 0, 2) !== 'MZ') throw Error('Invalid update executable');
  const offset = bytes.readUInt32LE(60);
  if (offset > bytes.length - 6 || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0') throw Error('Invalid update executable');
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expectedHash.toLowerCase()) throw Error('Update checksum mismatch');
}
async function downloadArtifact(url, file, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)
      || redirects > 5) throw Error('Untrusted update download');
  await new Promise((resolve, reject) => {
    let output;
    const request = https.get(parsed, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadArtifact(new URL(response.headers.location, parsed).href, file, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(Error('Update download failed')); return; }
      let size = 0;
      output = fs.createWriteStream(file);
      const fail = () => { response.destroy(); output.destroy(); reject(Error('Update download interrupted')); };
      response.on('data', chunk => { size += chunk.length; if (size > 512 * 1024 * 1024) fail(); });
      response.on('aborted', fail); response.on('error', fail); output.on('error', fail);
      output.on('finish', () => output.close(error => error ? reject(Error('Update download interrupted')) : resolve()));
      response.pipe(output);
    });
    request.on('error', () => reject(Error('Update download failed')));
    request.setTimeout(60000, () => request.destroy());
  });
}
async function prepareUpdate({ version, url, sha256, installRoot, profile, startupPath, previousExe,
  parentExe = process.execPath, parentPid = process.pid, parentStartedAt = Date.now() - process.uptime() * 1000,
  download = downloadArtifact, spawnProcess = spawn }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{64}$/i.test(sha256 || '')) throw Error('Invalid update metadata');
  const installed = Number(version.split('.')[0]) >= 2;
  const expectedUrl = `https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.${version}.${installed ? 'zip' : 'exe'}`;
  if (url !== expectedUrl) throw Error('Untrusted update release');
  if (!fs.existsSync(previousExe || '')) throw Error('Previous executable unavailable');
  if (installed) {
    slotFor(installRoot, previousExe);
    if (path.resolve(parentExe).toLowerCase() !== path.resolve(previousExe).toLowerCase()) throw Error('Installed parent mismatch');
  } else if (path.dirname(previousExe) !== installRoot) throw Error('Previous portable executable unavailable');
  fs.mkdirSync(installRoot, { recursive: true });
  const transactions = path.join(installRoot, '.updates');
  if (fs.realpathSync(installRoot).toLowerCase() !== path.resolve(installRoot).toLowerCase()) throw Error('Redirected install root');
  assertPlainTree(transactions);
  fs.mkdirSync(transactions, { recursive: true });
  // Only abandoned, pre-handoff staging jobs may be removed. The main process
  // serializes update attempts; completed/failed supervisor evidence is retained.
  for (const entry of fs.readdirSync(transactions)) {
    if (!/^[a-f0-9]{32}$/.test(entry)) continue;
    const abandoned = path.join(transactions, entry);
    const record = read(path.join(abandoned, 'manifest.json'));
    if (record?.nonce === entry && record.phase === 'staging') {
      assertPlainTree(abandoned);
      fs.rmSync(abandoned, { recursive: true });
    }
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const directory = path.join(installRoot, '.updates', nonce);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ nonce, version, phase: 'staging' }));
  const partial = path.join(directory, installed ? 'runtime.zip' : 'candidate.exe');
  let candidateExe;
  try {
  await download(url, partial);
  if (installed) {
    candidateExe = await stageRuntime({ installRoot, previousExe, archive: partial, staging: path.join(directory, 'payload'), sha256, version });
  } else {
    validateArtifact(partial, sha256);
    candidateExe = path.join(installRoot, `myREWRD.TV.Box.${version}.exe`);
    fs.renameSync(partial, candidateExe);
  }
  } catch (error) {
    // The active runtime/startup have not been handed off. Bound disk use and
    // allow the regular polling backoff to retry an interrupted download.
    assertPlainTree(directory);
    fs.rmSync(directory, { recursive: true });
    throw error;
  }
  fs.rmSync(partial, { force: true });
  const executableHash = crypto.createHash('sha256').update(fs.readFileSync(candidateExe)).digest('hex');
  const previousSha256 = crypto.createHash("sha256").update(fs.readFileSync(previousExe)).digest("hex");
  const manifest = { nonce, version, sha256: executableHash, archiveSha256: sha256.toLowerCase(), installed, previousSha256, previousExe, candidateExe, profile, startupPath, parentExe, parentPid, parentStartedAt };
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const supervisor = path.join(directory, 'supervisor.exe');
  fs.copyFileSync(path.join(__dirname, 'update-supervisor.exe'), supervisor);
  const job = { ...manifest, directory };
  let failed = false;
  const errorLog = fs.openSync(path.join(directory, 'supervisor-errors.log'), 'a');
  const child = spawnProcess(supervisor, [manifestPath], {
    cwd: installRoot, detached: true, stdio: ['ignore', 'ignore', errorLog], windowsHide: true,
  });
  fs.closeSync(errorLog);
  child.once('error', error => {
    failed = true;
    fs.appendFileSync(path.join(directory, 'supervisor-errors.log'), `Supervisor launch error: ${String(error.code || 'unknown').replace(/[^A-Z_]/g, '')}\n`);
  });
  child.once('exit', code => {
    if (code !== 0) failed = true;
    fs.appendFileSync(path.join(directory, 'supervisor-errors.log'), `Supervisor exit: ${Number(code)}\n`);
  });
  child.unref();
  const deadline = Date.now() + 60000;
  while (!failed && Date.now() < deadline) {
    if (hasMark(job, 'supervisor.ready.json', 'supervisor-ready')) return { ...job, supervisorPid: child.pid };
    await wait(100);
  }
  mark(job, 'abort.json', 'abort');
  throw Error('Update supervisor did not become ready; keeping current board');
}

function createCandidate({ argv, installRoot, profile, version, app, activate }) {
  const flag = argv.find(value => value.startsWith('--tv-update-job='));
  if (!flag) return null;
  const manifestPath = path.resolve(flag.slice('--tv-update-job='.length));
  const directory = path.dirname(manifestPath);
  const nonce = path.basename(directory);
  if (!/^[a-f0-9]{32}$/.test(nonce) || path.dirname(directory) !== path.join(installRoot, '.updates')
      || path.basename(manifestPath) !== 'manifest.json') throw Error('Invalid update transaction path');
  const manifest = read(manifestPath);
  if (manifest?.nonce !== nonce || manifest.version !== version || manifest.profile !== profile) throw Error('Invalid update transaction');
  const job = { ...manifest, directory };
  let ready = false; let active = false; let complete = false;
  const deadline = Date.now() + 120000;
  const poll = setInterval(() => {
    if (hasMark(job, 'abort.json', 'abort') || Date.now() > deadline) { clearInterval(poll); app.exit(1); return; }
    if (ready && !active && hasMark(job, 'commit.json', 'commit')) {
      active = true;
      activate();
      mark(job, 'candidate.active.json', 'active');
    }
    if (active && hasMark(job, 'complete.json', 'complete')) { complete = true; clearInterval(poll); }
  }, 100);
  app.on('before-quit', () => clearInterval(poll));
  return {
    get active() { return active; },
    get complete() { return complete; },
    boardReady() { if (!ready) { ready = true; mark(job, 'candidate.ready.json', 'board-ready'); } },
  };
}
module.exports = { prepareUpdate, createCandidate, blockedVersion, validateArtifact, downloadArtifact };
