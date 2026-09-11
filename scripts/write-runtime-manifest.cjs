const fs = require('node:fs');
const path = require('node:path');
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  fs.writeFileSync(path.join(context.appOutDir, 'runtime-release.json'), JSON.stringify({
    version: require('../package.json').version, layout: 'installed-ab-v1',
  }));
};
