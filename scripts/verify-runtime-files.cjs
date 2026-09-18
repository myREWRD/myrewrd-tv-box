const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const source = path.resolve(process.argv[2] || 'dist/win-unpacked/resources/app.asar');
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-runtime-files-'));
const root = path.join(parent, 'probe');
const result = path.join(root, 'result.json');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'electron-runtime-files.cjs'), source, root], { env, windowsHide: true, stdio: 'ignore' });
let launchError; child.on('error', error => { launchError = error; });
(async () => {
  const deadline = Date.now() + 75000;
  while (!fs.existsSync(result)) {
    if (launchError) throw launchError;
    if (Date.now() > deadline) { child.kill(); throw Error('Normal Electron runtime-files probe timed out'); }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const report = JSON.parse(fs.readFileSync(result, 'utf8'));
  assert.equal(report.ok, true, JSON.stringify(report));
  console.log('PASS normal Electron physical-ASAR exclusive-open and failed staging cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
