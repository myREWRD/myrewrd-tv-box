const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(process.argv[2]);
const repo = path.join(__dirname, '..');
require('./build-supervisor.cjs').build();
for (const version of ['1.0.5', '1.0.6']) {
  const project = path.join(root, version); fs.mkdirSync(project, { recursive: true });
  fs.cpSync(path.join(repo, 'src'), path.join(project, 'src'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'packaged-fixture.cjs'), path.join(project, 'fixture.cjs'));
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'myrewrd-tv-box', version, main: 'fixture.cjs',
    build: { appId: 'com.myrewrd.tvbox', productName: 'myREWRD TV Box', electronVersion: '30.5.1', npmRebuild: false,
      win: { target: [{ target: 'portable', arch: ['x64'] }], signAndEditExecutable: false } } }));
  execFileSync(process.execPath, [path.join(repo, 'node_modules', 'electron-builder', 'cli.js'), '--projectDir', project, '--win', 'portable', '--publish', 'never'], { stdio: 'inherit', timeout: 600000 });
}
