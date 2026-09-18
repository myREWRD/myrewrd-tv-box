// Run in normal Electron, never ELECTRON_RUN_AS_NODE: ASAR patching is the bug.
const { app } = require('electron');
const fs = require('original-fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { assertPlainTree } = require('../src/installed-runtime');
const { prepareUpdate } = require('../src/update');
const source = process.argv[2], root = process.argv[3];
if (!source || !root || !path.isAbsolute(source) || !path.isAbsolute(root) || fs.existsSync(root)) throw Error('Provide an existing absolute app.asar and a new absolute test directory');
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
const result = path.join(root, 'result.json');
const fail = error => { fs.writeFileSync(result, JSON.stringify({ ok: false, error: String(error) })); app.exit(1); };
const timeout = setTimeout(() => fail('timeout'), 60000);
app.whenReady().then(async () => {
  assert.equal(process.type, 'browser');
  const inactive = path.join(root, 'runtime-a');
  fs.mkdirSync(path.join(inactive, 'resources'), { recursive: true });
  fs.copyFileSync(source, path.join(inactive, 'resources', 'app.asar'));
  assertPlainTree(inactive);
  execFileSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(__dirname, '../src/assert-runtime-idle.ps1'), '-Directory', inactive], { windowsHide: true, stdio: 'pipe' });
  // Failed staging must remove a real ASAR payload without caching its handle.
  const previousExe = path.join(root, 'runtime-b', 'myREWRD TV Box.exe');
  fs.mkdirSync(path.dirname(previousExe)); fs.writeFileSync(previousExe, 'fixture');
  await assert.rejects(prepareUpdate({ version: '2.1.1', url: 'https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.2.1.1.zip',
    sha256: 'a'.repeat(64), installRoot: root, profile: path.join(root, 'profile'), startupPath: path.join(root, 'startup.bat'), previousExe, parentExe: previousExe,
    download: async (_url, archive) => { const payload = path.join(path.dirname(archive), 'payload'); fs.mkdirSync(payload); fs.copyFileSync(source, path.join(payload, 'app.asar')); throw Error('synthetic interrupted staging'); },
  }), /synthetic interrupted staging/);
  assert.equal(fs.readdirSync(path.join(root, '.updates')).length, 0);
  fs.rmSync(inactive, { recursive: true });
  fs.writeFileSync(result, JSON.stringify({ ok: true, normalElectron: true, inactiveExclusiveOpen: true, failedStagingCleanup: true }));
  clearTimeout(timeout); app.quit();
}).catch(fail);
