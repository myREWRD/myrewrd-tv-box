// Executes the unchanged updater against real HTTP transfers and isolated files.
// Process launch is captured, so this cannot update the workstation or its startup.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const artifact = path.resolve(process.argv[2]);
const bytes = fs.readFileSync(artifact);
assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
assert.equal(bytes.toString('ascii', bytes.readUInt32LE(60), bytes.readUInt32LE(60) + 4), 'PE\0\0');
assert.ok(bytes.length > 10 * 1024 * 1024);
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const updater = source.slice(source.indexOf('function compareVersions('), source.indexOf('// ─── Command Handler'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myrewrd-updater-test-'));
const server = http.createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/binary` }); res.end(); }
  else if (req.url === '/binary') { res.writeHead(200); res.end(bytes); }
  else if (req.url === '/small') { res.writeHead(200); res.end('<html>not an executable</html>'); }
  else { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1', async () => {
  try {
    for (const endpoint of ['small', 'missing', 'redirect']) {
      const install = path.join(root, endpoint);
      const startup = path.join(install, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      fs.mkdirSync(startup, { recursive: true });
      const launches = []; let quits = 0;
      const context = vm.createContext({ fs, path, http, https, console,
        APP_VERSION: '1.0.3', INSTALL_DIR: install, isUpdating: false,
        process: { execPath: path.join(install, 'old.exe'), env: { APPDATA: install } },
        execFile: (...args) => launches.push(args), app: { quit: () => quits++ },
      });
      vm.runInContext(updater, context);
      await context.checkForUpdate('1.0.4', `http://127.0.0.1:${server.address().port}/${endpoint}`, false);
      if (endpoint !== 'redirect') {
        assert.equal(launches.length, 0); assert.equal(quits, 0);
        assert.equal(fs.existsSync(path.join(startup, 'myREWRD-TV-Box.bat')), false);
      } else {
        assert.equal(launches.length, 1); assert.equal(quits, 1);
        const downloaded = fs.readFileSync(launches[0][0]);
        assert.equal(crypto.createHash('sha256').update(downloaded).digest('hex'), crypto.createHash('sha256').update(bytes).digest('hex'));
        assert.ok(fs.readFileSync(path.join(startup, 'myREWRD-TV-Box.bat'), 'utf8').includes(launches[0][0]));
        await context.checkForUpdate('1.0.4', `http://127.0.0.1:${server.address().port}/binary`, false);
        assert.equal(launches.length, 1);
      }
    }
    console.log('PASS updater: small/HTTP-error rejection, redirected binary transfer/hash, startup target, launch/quit handoff, duplicate guard. Launch was captured; no physical upgrade claimed.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { server.close(); }
});
