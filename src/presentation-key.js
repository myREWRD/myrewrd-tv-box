const fs = require('node:fs');
const path = require('node:path');
// First-run import is consumed once. Electron safeStorage uses Windows DPAPI.
function loadPresentationKey({ safeStorage, profile, installDir }) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = path.join(profile, 'presentation-key.enc');
  const incoming = path.join(installDir, 'presentation-key.json');
  try {
    if (fs.existsSync(incoming)) {
      const { key } = JSON.parse(fs.readFileSync(incoming, 'utf8'));
      if (!/^[a-f0-9]{64}$/.test(key || '')) return null;
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(`${encrypted}.tmp`, safeStorage.encryptString(key));
      fs.renameSync(`${encrypted}.tmp`, encrypted);
      fs.unlinkSync(incoming);
    }
    if (!fs.existsSync(encrypted)) return null;
    const key = safeStorage.decryptString(fs.readFileSync(encrypted));
    return /^[a-f0-9]{64}$/.test(key) ? key : null;
  } catch { return null; }
}
module.exports = { loadPresentationKey };
