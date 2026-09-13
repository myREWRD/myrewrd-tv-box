const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sign = require('./sign-protected-runtime.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Build the TV runtime on Windows x64');
  // Package/edit/Authenticode-sign first. electron-builder 24 skips afterSign
  // without an Authenticode certificate, so VMP signing must be explicit here.
  execFileSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', '--dir', '--publish', 'never'], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  });
  const appOutDir = path.join(root, 'dist', 'win-unpacked');
  await sign({ electronPlatformName: 'win32', appOutDir });
  const version = require('../package.json').version;
  const zip = path.join(root, 'dist', `myREWRD.TV.Box.${version}.zip`);
  if (fs.existsSync(zip)) fs.unlinkSync(zip); // Only this build's exact output file.
  execFileSync(require('7zip-bin').path7za, ['a', '-tzip', '-mx=7', zip, '.'], {
    cwd: appOutDir, stdio: 'inherit', windowsHide: true,
  });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
