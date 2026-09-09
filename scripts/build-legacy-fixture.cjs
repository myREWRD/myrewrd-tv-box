// Pin the released 1.0.4 implementation. Only redirect its install folder into
// the isolated portable test root; its original updater/execFile call is intact.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const project = path.resolve(process.argv[2], '1.0.4');
fs.mkdirSync(path.join(project, 'src'), { recursive: true });
const revision = '6c8182793e2ee7a96391b8f11aab68eff93dff39';
const git = args => execFileSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, ...args], { cwd: repo });
const files = git(['ls-tree', '-r', '--name-only', revision, 'src']).toString().trim().split('\n');
for (const file of files) {
  fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
  fs.writeFileSync(path.join(project, file), git(['show', `${revision}:${file}`]));
}
const mainPath = path.join(project, 'src', 'main.js');
const main = fs.readFileSync(mainPath, 'utf8');
const declaration = 'const INSTALL_DIR = "C:\\\\Users\\\\myrewrd\\\\myREWRD-TV-Box";';
if (!main.includes(declaration)) throw Error('Legacy isolation patch no longer matches');
fs.writeFileSync(mainPath, main.replace(declaration, 'const INSTALL_DIR = process.env.PORTABLE_EXECUTABLE_DIR;'));
fs.copyFileSync(path.join(__dirname, 'packaged-fixture.cjs'), path.join(project, 'fixture.cjs'));
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'myrewrd-tv-box', version: '1.0.4', main: 'fixture.cjs',
  build: { appId: 'com.myrewrd.tvbox', productName: 'myREWRD TV Box', electronVersion: '30.5.1', npmRebuild: false,
    win: { target: [{ target: 'portable', arch: ['x64'] }], signAndEditExecutable: false } } }));
execFileSync(process.execPath, [path.join(repo, 'node_modules', 'electron-builder', 'cli.js'), '--projectDir', project,
  '--win', 'portable', '--publish', 'never'], { stdio: 'inherit', timeout: 600000 });
