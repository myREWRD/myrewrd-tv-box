// Runtime archives are physical files, not Electron's virtual ASAR directories.
// Even lstat through patched fs can cache a handle and block Windows replacement.
module.exports = process.versions.electron ? require('original-fs') : require('node:fs');
