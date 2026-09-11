const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const scriptRoot = __dirname.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
const EXE = 'myREWRD TV Box.exe';
function slotFor(root, executable) {
  for (const slot of ['runtime-a', 'runtime-b']) {
    if (path.resolve(executable).toLowerCase() === path.join(path.resolve(root), slot, EXE).toLowerCase()) return slot;
  }
  throw Error('App is not running from an installed runtime slot');
}
function assertPlainTree(directory) {
  if (!fs.existsSync(directory)) return;
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unsafe runtime directory');
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, item.name);
    if (fs.lstatSync(child).isSymbolicLink()) throw Error('Runtime reparse point denied');
    if (item.isDirectory()) assertPlainTree(child);
  }
}
async function stageRuntime({ installRoot, previousExe, archive, staging, sha256, version }) {
  const slot = slotFor(installRoot, previousExe);
  // Resolve parents as well as leaves, so junctions cannot redirect writes.
  if (fs.realpathSync(installRoot).toLowerCase() !== path.resolve(installRoot).toLowerCase()) throw Error('Redirected install root');
  assertPlainTree(path.join(installRoot, slot));
  const inactive = path.join(installRoot, slot === 'runtime-a' ? 'runtime-b' : 'runtime-a');
  assertPlainTree(inactive);
  await execute(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptRoot, 'expand-runtime.ps1'),
      '-ArchivePath', archive, '-Destination', staging, '-ExpectedHash', sha256, '-ExpectedVersion', version],
    { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  // Windows refuses removing locked executables. Never kill another process to
  // make the inactive slot writable; abort and leave the current board running.
  assertPlainTree(inactive);
  await execute(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptRoot, 'assert-runtime-idle.ps1'), '-Directory', inactive],
    { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  if (fs.existsSync(inactive)) fs.rmSync(inactive, { recursive: true });
  fs.renameSync(staging, inactive);
  return path.join(inactive, EXE);
}
module.exports = { slotFor, stageRuntime, assertPlainTree };
