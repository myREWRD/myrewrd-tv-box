const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {prepareUpdate,blockedVersion}=require('../src/update');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tv-stage-retry-'));
 const exe=path.join(root,'runtime-a','myREWRD TV Box.exe');fs.mkdirSync(path.dirname(exe));fs.writeFileSync(exe,'current');
 const args={version:'2.9.0',url:'https://github.com/myREWRD/myrewrd-tv-box/releases/download/latest/myREWRD.TV.Box.2.9.0.zip',sha256:'0'.repeat(64),installRoot:root,previousExe:exe,parentExe:exe};
 for(let i=0;i<3;i++){
 await assert.rejects(prepareUpdate({...args,download:async(_u,f)=>{fs.writeFileSync(f,Buffer.alloc(1024));throw Error('network interruption')}}),/network interruption/);
 assert.equal(blockedVersion(root,'2.9.0'),false);assert.equal(fs.readdirSync(path.join(root,'.updates')).length,0);assert.equal(fs.readFileSync(exe,'utf8'),'current');
 }
 const nonce='a'.repeat(32),old=path.join(root,'.updates',nonce);fs.mkdirSync(old);fs.writeFileSync(path.join(old,'manifest.json'),JSON.stringify({nonce,phase:'staging',version:'2.9.0'}));fs.writeFileSync(path.join(old,'runtime.zip'),'abandoned');
 await assert.rejects(prepareUpdate({...args,download:async()=>{throw Error('retry')}}),/retry/);assert.equal(fs.existsSync(old),false);
 console.log('PASS interrupted download retries clean staging and preserve current app');
})().catch(e=>{console.error(e);process.exitCode=1});
