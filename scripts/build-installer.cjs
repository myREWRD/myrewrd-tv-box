const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const version = require('../package.json').version;
const root = path.join(__dirname, '..');
const zip = path.join(root, 'dist', `myREWRD.TV.Box.${version}.zip`);
const hash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
const template = fs.readFileSync(path.join(__dirname, 'install-runtime.template.ps1'), 'utf8');
const expand = fs.readFileSync(path.join(root, 'src', 'expand-runtime.ps1'), 'utf8');
const ready = fs.readFileSync(path.join(root, 'src', 'ready-provision.ps1'), 'utf8');
const contentHash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist','win-unpacked',file))).digest('hex');
// Function definition must precede the installer body, after its top-level param.
const installer = template.replace('param([switch]$NoRestart,[string]$RuntimeArchive,[switch]$ReadyForProvision)', () => `param([switch]$NoRestart,[string]$RuntimeArchive,[switch]$ReadyForProvision)\nfunction ExpandVerifiedRuntime {\n${expand}\n}\n${ready}`)
  .replaceAll('@VERSION@', version).replaceAll('@HASH@', hash)
  .replaceAll('@ASAR_HASH@',contentHash('resources/app.asar'))
  .replaceAll('@HELPER_HASH@',contentHash('resources/app.asar.unpacked/src/maintenance-launcher.exe'));
fs.writeFileSync(path.join(root, 'dist', `myREWRD.TV.Box.${version}.setup.ps1`), installer);
console.log(`Built administrator migration for ${version}; ZIP SHA256 ${hash}`);
