const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {publicMetadata, validateContext, readMetadata, readContext, createTransport, enroll, HEADER, PROJECT} = require('../src/acceptance-context');
const home = fs.mkdtempSync(path.join(os.tmpdir(),'kuevy-office-context-'));
const now = Date.now();
const metadata = {schema:1, origin:'https://ssdt-dashboard-fixture-byvenuecreative.vercel.app', environment:'preview',
  databaseRef:PROJECT, version:'2.3.31', deploymentSha:'a'.repeat(40), candidateSha:'b'.repeat(40), tree:'c'.repeat(40),
  metadataVerified:true, expiresAt:now+3600000};
const claims = {iss:'https://oidc.vercel.com/byvenuecreative',aud:'https://vercel.com/byvenuecreative',owner:'byvenuecreative',
  project:'ssdt-dashboard',environment:'development',sub:'owner:byvenuecreative:project:ssdt-dashboard:environment:development',exp:Math.floor(now/1000)+3600};
const oidc = `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
const value = {...metadata,oidc};
const storage = {isEncryptionAvailable:()=>true, encryptString:s=>Buffer.from('encrypted-fixture:'+s),decryptString:b=>b.toString().slice(18)};
const attestation = {environment:'preview',origin:metadata.origin,databaseRef:PROJECT,version:'2.3.31',deploymentSha:metadata.deploymentSha,boundary:2};
async function run() {
  assert.throws(()=>publicMetadata({...metadata,oidc}));
  assert.throws(()=>publicMetadata({...metadata,credential:'fixture'}));
  await assert.rejects(enroll(home,storage,{...metadata,oidc},oidc,async()=>{throw Error('Must not run')}));
  assert.equal(fs.existsSync(path.join(home,'.kuevy-acceptance','enrolled.json')),false);
  for(const change of [{origin:'https://app.myrewrd.com'},{origin:'https://ssdt-dashboard-git-fixture-byvenuecreative.vercel.app'},
    {origin:metadata.origin+'/'},{databaseRef:'production'},{deploymentSha:'bad'},{metadataVerified:false},{expiresAt:now-1},{version:'2.3.30'}]) {
    assert.throws(()=>validateContext({...value,...change},'2.3.31',now));
  }
  const requests=[];
  const transport=createTransport(value,async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(url.endsWith('tv-acceptance')?attestation:{ok:true}),{headers:{'Content-Type':'application/json'}});},{now:()=>now});
  await transport.fetch(metadata.origin+'/api/tv-reset',{method:'POST',headers:{Authorization:'Bearer synthetic'}});
  assert.equal(requests.length,2);for(const request of requests){assert.equal(request.options.redirect,'manual');assert.equal(request.options.headers.get(HEADER),oidc);}
  await assert.rejects(transport.fetch('https://app.myrewrd.com/api/tv-reset'));assert.equal(requests.length,2);
  const foreign=transport.electronHeaders({url:'https://www.youtube.com/',requestHeaders:{[HEADER]:oidc,'X-Vercel-Protection-Bypass':'fixture',Accept:'video'}});
  assert.deepEqual(foreign,{requestHeaders:{Accept:'video'}});
  assert.equal(transport.electronHeaders({url:metadata.origin+'/tv/synthetic',requestHeaders:{}}).requestHeaders[HEADER],oidc);
  let blocked=0;
  const mismatch=createTransport(value,async()=>new Response(JSON.stringify({...attestation,databaseRef:'production'})),{now:()=>now,blocked:()=>blocked++});
  await assert.rejects(mismatch.fetch(metadata.origin+'/api/tv-reset'));assert.equal(blocked,1);
  const redirects=createTransport(value,async()=>new Response(null,{status:302,headers:{Location:'https://app.myrewrd.com'}}),{now:()=>now});
  await assert.rejects(redirects.verify());
  const expired=createTransport(value,async()=>{throw Error('Must not run')},{now:()=>now+7200000,blocked:()=>blocked++});
  assert.equal(expired.electronHeaders({url:metadata.origin+'/tv/synthetic',requestHeaders:{}}).cancel,true);
  await assert.rejects(expired.fetch(metadata.origin+'/api/tv-reset'));
  assert.equal(readMetadata(home,'2.3.31'),null);
  await enroll(home,storage,metadata,oidc,async()=>new Response(JSON.stringify(attestation)));
  assert.equal(fs.readFileSync(path.join(home,'.kuevy-acceptance','enrolled.json'),'utf8').includes(oidc),false);
  assert.equal(readMetadata(home,'2.3.31').origin,metadata.origin);
  assert.equal(readContext(home,storage,'2.3.31').oidc,oidc);
  const directory=path.join(home,'.kuevy-acceptance'),file=path.join(directory,'context.enc'),temporary=file+'.tmp';
  const foreignFolder=path.join(home,'foreign');fs.mkdirSync(foreignFolder);fs.writeFileSync(path.join(foreignFolder,'sentinel'),'preserve');
  fs.symlinkSync(foreignFolder,temporary,'junction');
  await assert.rejects(enroll(home,storage,metadata,oidc,async()=>new Response(JSON.stringify(attestation))));
  fs.writeFileSync(file,storage.encryptString(JSON.stringify(value)));
  assert.throws(()=>readContext(home,storage,'2.3.31'));
  assert.equal(fs.readFileSync(path.join(foreignFolder,'sentinel'),'utf8'),'preserve');
  fs.unlinkSync(temporary);
  assert.equal(readContext(home,storage,'2.3.31').oidc,oidc);
  fs.unlinkSync(path.join(home,'.kuevy-acceptance','context.enc'));
  assert.throws(()=>readContext(home,storage,'2.3.31'));assert.equal(readMetadata(home,'2.3.31').origin,metadata.origin);
  assert.throws(()=>readContext(home,{isEncryptionAvailable:()=>false},'2.3.31'));
  let time=now, checks=0;
  const refresh=createTransport(value,async()=>{checks++;return new Response(JSON.stringify(attestation));},{now:()=>time});
  await Promise.all([refresh.verify(),refresh.verify()]);assert.equal(checks,1);
  time+=61000;await refresh.verify();assert.equal(checks,2);
  console.log('PASS isolated office context, origin/identity/expiry refusals, scoped headers, redirect refusal, protected-store fail-closed and attestation refresh. Synthetic transport/storage fixtures only.');
}
run().finally(()=>fs.rmSync(home,{recursive:true,force:true})).catch(()=>{console.error('Office acceptance verification failed');process.exitCode=1;});
