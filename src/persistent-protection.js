// Windows CurrentUser DPAPI survives deletion of Chromium's Local State key.
// Only reset recovery and temporary office access may use this store.
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const purposes = new Set(['reset-recovery','office-context']);
function prefix(purpose) {
  if (!purposes.has(purpose)) throw Error('Persistent protection purpose denied');
  return `kuevy-dpapi:v1:${purpose}:`;
}
function transform(mode,purpose,value) {
  prefix(purpose);
  if (process.platform !== 'win32' || !Buffer.isBuffer(value) || !value.length || value.length > 20000) throw Error('Windows persistent protection unavailable');
  try {
    const script=path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'persistent-protection.ps1');
    const output=execFileSync(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),
      ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode,'-Purpose',purpose],
      {input:value.toString('base64')+'\n',encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:40000,stdio:['pipe','pipe','pipe']}).trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(output)) throw Error('Invalid protected envelope');
    return Buffer.from(output,'base64');
  } catch { throw Error('Windows persistent protection failed'); }
}
function protect(purpose,text) {
  if (typeof text !== 'string' || !text.length) throw Error('Persistent protection input denied');
  return Buffer.from(prefix(purpose)+transform('protect',purpose,Buffer.from(text,'utf8')).toString('base64'));
}
function isProtected(purpose,value) {return Buffer.isBuffer(value) && value.toString().startsWith(prefix(purpose));}
function unprotect(purpose,value,legacyStorage) {
  if (!Buffer.isBuffer(value) || !value.length) throw Error('Protected envelope required');
  const encoded=value.toString();
  if (encoded.startsWith('kuevy-dpapi:')) {
    if (!isProtected(purpose,value)) throw Error('Protected envelope purpose or version denied');
    const body=encoded.slice(prefix(purpose).length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw Error('Invalid protected envelope');
    return transform('unprotect',purpose,Buffer.from(body,'base64')).toString('utf8');
  }
  // Migrate only while the original Chromium key remains available. Never
  // restore a deleted profile or accept plaintext as a recovery fallback.
  try {return legacyStorage.decryptString(value);} catch {throw Error('Legacy protected state needs attended recovery');}
}
module.exports={protect,unprotect,isProtected};
