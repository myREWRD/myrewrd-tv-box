// Office acceptance only. Production has no environment-variable API override.
const fs = require('node:fs');
const path = require('node:path');
const protection = require('./persistent-protection');
const PRODUCTION = 'https://app.myrewrd.com';
const PROJECT = 'rwcpejpazuomogzvbwfy';
const HEADER = 'x-vercel-trusted-oidc-idp-token';
const SHA = /^[a-f0-9]{40}$/;
const METADATA_KEYS = ['schema','origin','environment','databaseRef','version','deploymentSha','candidateSha','tree','metadataVerified','expiresAt'];
function publicMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !METADATA_KEYS.includes(key))) throw Error('Public office metadata must contain no access credentials');
  return Object.fromEntries(METADATA_KEYS.map(key => [key,value[key]]));
}
function validateMetadata(value, version, now = Date.now()) {
  const url = new URL(value.origin);
  if (url.href !== value.origin + '/' || !/^https:\/\/ssdt-dashboard-[a-z0-9]+-byvenuecreative\.vercel\.app$/.test(value.origin)
      || value.schema !== 1 || value.environment !== 'preview' || value.databaseRef !== PROJECT
      || value.version !== version || !SHA.test(value.deploymentSha) || !SHA.test(value.candidateSha) || !SHA.test(value.tree)
      || value.metadataVerified !== true || !(value.expiresAt > now) || value.expiresAt > now + 86400000) {
    throw Error('Office acceptance context is invalid or expired');
  }
  return value;
}
function validateContext(value, version, now = Date.now()) {
  validateMetadata(value, version, now);
  // Consistency/expiry checks only. Vercel authenticates the signed token.
  let claims;
  try { claims = JSON.parse(Buffer.from(value.oidc.split('.')[1], 'base64url').toString('utf8')); } catch { throw Error('Office access needs refresh'); }
  if (!['https://oidc.vercel.com', 'https://oidc.vercel.com/byvenuecreative'].includes(claims.iss)
      || claims.aud !== 'https://vercel.com/byvenuecreative' || claims.owner !== 'byvenuecreative'
      || claims.project !== 'ssdt-dashboard' || claims.environment !== 'development'
      || claims.sub !== 'owner:byvenuecreative:project:ssdt-dashboard:environment:development'
      || !(claims.exp * 1000 > now + 30000) || (claims.nbf && claims.nbf * 1000 > now)) throw Error('Office access needs refresh');
  return value;
}
function assertPlain(file) {
  for (let cursor = path.resolve(file); cursor !== path.dirname(cursor); cursor = path.dirname(cursor)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error('Redirected acceptance context denied');
  }
}
function atomicWrite(file,value) {
  const temporary=file+'.tmp';
  assertPlain(file);assertPlain(temporary);
  fs.writeFileSync(temporary,value,{flag:'wx'});
  assertPlain(file);assertPlain(temporary);
  fs.renameSync(temporary,file);
}
function readContext(home, safeStorage, version) {
  const folder = path.join(home, '.kuevy-acceptance'), marker = path.join(folder, 'enrolled.json'), file = path.join(folder, 'context.enc');
  assertPlain(file); assertPlain(marker);
  if (!fs.existsSync(file) && !fs.existsSync(marker)) return null;
  if (!fs.existsSync(file) || !fs.existsSync(marker) || !safeStorage?.isEncryptionAvailable()) throw Error('Office acceptance access is incomplete');
  try {
    const encrypted=fs.readFileSync(file);
    const context=validateContext(JSON.parse(protection.unprotect('office-context',encrypted,safeStorage)),version);
    if(!protection.isProtected('office-context',encrypted))atomicWrite(file,protection.protect('office-context',JSON.stringify(context)));
    return context;
  }
  catch { throw Error('Office acceptance access needs refresh; production fallback is disabled'); }
}
function readMetadata(home, version) {
  const marker = path.join(home, '.kuevy-acceptance', 'enrolled.json');
  const file = path.join(home, '.kuevy-acceptance', 'context.enc');
  assertPlain(marker); assertPlain(file);
  if (!fs.existsSync(marker) && !fs.existsSync(file)) return null;
  if (!fs.existsSync(marker)) throw Error('Acceptance marker missing; production fallback denied');
  return validateMetadata(publicMetadata(JSON.parse(fs.readFileSync(marker, 'utf8'))), version);
}
function enrollmentMetadata(argv, home, version) {
  const index = argv.indexOf('--kuevy-enroll-acceptance');
  if (index < 0) return readMetadata(home, version);
  const file = argv[index + 1];
  if (!file || !path.isAbsolute(file)) throw Error('Office enrollment metadata required');
  assertPlain(file);
  return validateMetadata(publicMetadata(JSON.parse(fs.readFileSync(file, 'utf8'))), version);
}
async function enroll(home, safeStorage, metadata, oidc, transport) {
  metadata = publicMetadata(metadata);
  if (!safeStorage?.isEncryptionAvailable()) throw Error('Windows credential protection required');
  const value = validateContext({...metadata, oidc}, metadata.version);
  await createTransport(value, transport).verify();
  const folder = path.join(home, '.kuevy-acceptance');
  assertPlain(path.join(folder,'context.enc')); assertPlain(path.join(folder,'enrolled.json'));
  fs.mkdirSync(folder, {recursive:true});
  // Marker first: an interrupted enrollment must block production fallback.
  atomicWrite(path.join(folder,'enrolled.json'),JSON.stringify(metadata));
  atomicWrite(path.join(folder,'context.enc'),protection.protect('office-context',JSON.stringify(value)));
  return value;
}
function createTransport(context, transport, { now = Date.now, blocked = () => {} } = {}) {
  const origin = context?.origin || PRODUCTION;
  let verifiedAt = 0, checking = null;
  function valid() {
    if (!context) return;
    try { validateContext(context, context.version, now()); } catch { blocked(); throw Error('Office acceptance access needs refresh'); }
  }
  async function request(input, options = {}) {
    valid();
    const url = new URL(String(input));
    if (url.origin !== origin || url.username || url.password) throw Error('TV request outside installation origin denied');
    const headers = new Headers(options.headers);
    for (const name of [HEADER, 'x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie']) headers.delete(name);
    if (context) headers.set(HEADER, context.oidc);
    let response;
    try { response = await transport(url.href, {...options, headers, redirect:'manual'}); }
    catch { throw Error('TV connection unavailable'); }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel(); throw Error('TV connection redirect denied');
    }
    return response;
  }
  async function verify() {
    valid();
    if (!context || (verifiedAt && now() - verifiedAt < 60000)) return;
    if (!checking) checking = (async () => {
      const response = await request(origin + '/api/tv-acceptance', {signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('Office Preview verification failed');
      const value = await response.json();
      if (value.environment !== 'preview' || value.origin !== origin || value.databaseRef !== PROJECT
          || value.deploymentSha !== context.deploymentSha || value.version !== context.version || value.boundary !== 2) {
        blocked(); throw Error('Office Preview identity mismatch');
      }
      verifiedAt = now();
    })().finally(() => {checking = null;});
    await checking;
  }
  async function fetcher(input, options) { await verify(); return request(input, options); }
  function electronHeaders(details) {
    const headers = {...details.requestHeaders};
    for (const name of Object.keys(headers)) if ([HEADER,'x-vercel-protection-bypass','x-vercel-set-bypass-cookie'].includes(name.toLowerCase())) delete headers[name];
    const target = new URL(details.url);
    if (context && ['app.myrewrd.com','app.kuevy.com'].includes(target.hostname)) return {cancel:true};
    if (context && target.origin === origin) {
      try { valid(); if (!verifiedAt || now() - verifiedAt >= 60000) return {cancel:true}; headers[HEADER] = context.oidc; }
      catch { return {cancel:true}; }
    }
    return {requestHeaders:headers};
  }
  return {origin, fetch:context ? fetcher : transport, verify, electronHeaders};
}
module.exports = {PRODUCTION, PROJECT, HEADER, publicMetadata, validateMetadata, validateContext, readMetadata, readContext, enrollmentMetadata, enroll, createTransport};
