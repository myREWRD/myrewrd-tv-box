const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async context => {
  if (context.electronPlatformName !== 'win32') throw Error('Protected runtime packaging is validated on Windows only');
  const manifestPath = path.join(context.appOutDir, 'runtime-release.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const runtime = require('../node_modules/electron/package.json').version;
  if (runtime !== '44.1.0+wvcus') throw Error('Unexpected protected playback runtime');
  const development = process.env.TV_DRM_DEVELOPMENT_BUILD === '1';
  if (development && process.env.GITHUB_REF === 'refs/heads/main') {
    throw Error('Development DRM packages cannot be built on main');
  }
  if (!development) {
    // Windows VMP signing follows any Authenticode signing and precedes ZIP creation.
    // Credentials are read by EVS from its environment/cache; never CLI arguments.
    const python = process.env.TV_DRM_PYTHON || 'python';
    for (const action of ['sign-pkg', 'verify-pkg']) {
      execFileSync(python, ['-m', 'castlabs_evs.vmp', '--no-ask', action, context.appOutDir], {
        windowsHide: true, stdio: 'inherit', timeout: 120000,
      });
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, electron: runtime,
    protectedPlayback: development ? 'development-only' : 'production-vmp',
  }));
};
