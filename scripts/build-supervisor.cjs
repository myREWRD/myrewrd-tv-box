const path = require('node:path');
const { execFileSync } = require('node:child_process');
function build() {
  const metadata = require('../package.json');
  if (metadata.build.portable?.unpackDirName !== `myREWRD-TV-Box-${metadata.version}`) throw Error('Versioned runtime/firewall path must match release version');
  if (process.platform !== 'win32') throw Error('Build the TV update supervisor on Windows');
  const root = path.join(__dirname, '..');
  execFileSync(path.join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    ['/nologo', '/target:winexe', '/r:System.Web.Extensions.dll', `/out:${path.join(root, 'src', 'update-supervisor.exe')}`, path.join(root, 'src', 'update-supervisor.cs')]);
}
module.exports = async context => { if (context.electronPlatformName === 'win32') build(); };
module.exports.build = build;
if (require.main === module) build();
