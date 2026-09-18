const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual bridge preflight, including the PowerShell-selected
// profile, before any supervisor may stage or stop the installed process.
const script = fs.readFileSync(path.join(__dirname, 'repair-installed-2.2.0.ps1'), 'utf8');
const selectedName = script.match(/\$profile = Join-Path \$env:APPDATA '([^']+)'/)[1];
const code = script.match(/@'\r?\n([\s\S]*?)\r?\n'@/)[1];
const packaged = require('../package.json');
const appData = 'C:\\Users\\Fixture\\AppData\\Roaming';
const expected = path.win32.join(appData, packaged.productName || packaged.name);

function probe(profile, metadata = packaged) {
  let preparations = 0;
  const input = { payload: 'C:\\Fixture\\payload', profile };
  const context = {
    __dirname: 'C:\\Fixture\\stage',
    process: { env: { APPDATA: appData, ELECTRON_RUN_AS_NODE: '1' } },
    console: { error() {} },
    require(name) {
      if (name === 'original-fs') return { readFileSync: () => JSON.stringify(input), writeFileSync() {} };
      if (name === 'node:path') return path.win32;
      if (name.endsWith('package.json')) return metadata;
      if (name.endsWith('update.js')) return { prepareUpdate: async received => {
        preparations++; assert.equal(received.profile, expected);
        return { directory: 'fixture', nonce: 'fixture', version: '2.2.0', supervisorPid: 42 };
      } };
      throw Error(`Unexpected module ${name}`);
    },
  };
  let error;
  try { vm.runInNewContext(code, context); } catch (caught) { error = caught; }
  return { preparations, error, environment: context.process.env };
}
const good = probe(path.win32.join(appData, selectedName));
assert.ifError(good.error);
assert.equal(good.preparations, 1);
assert.equal(good.environment.ELECTRON_RUN_AS_NODE, undefined);
const wrong = probe(path.win32.join(appData, 'myREWRD TV Box'));
assert.match(wrong.error.message, /profile mismatch/);
assert.equal(wrong.preparations, 0);
const renamed = probe(expected, { ...packaged, productName: 'Changed application name' });
assert.match(renamed.error.message, /profile mismatch/);
assert.equal(renamed.preparations, 0);
console.log('PASS attended bridge uses Electron package profile and rejects mismatches before staging.');
