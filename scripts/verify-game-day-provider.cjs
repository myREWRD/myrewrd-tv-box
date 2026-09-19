const assert=require('node:assert/strict');
const {HOMES,resumeUrl,createGameDayProvider}=require('../src/game-day-provider');
let config={},writes=[];
const controller=createGameDayProvider({getConfig:()=>config,save:data=>{writes.push(data);config={...config,...data};}});
assert.equal(controller.target(),HOMES.youtube);
assert.equal(controller.choose('__proto__'),null);
controller.choose('hulu');
controller.capture('https://www.hulu.com/watch/channel-123?secret=discard#also-discard');
assert.equal(controller.target(),'https://www.hulu.com/watch/channel-123');
assert.deepEqual(writes,[{gameDayProvider:'hulu'}]);
assert.equal(createGameDayProvider({getConfig:()=>config,save(){}}).target(),HOMES.hulu,'restart remembers provider but not channel URL');
for(const value of ['https://www.hulu.com/login','https://auth.hulu.com/watch/test','https://www.hulu.com.evil.invalid/watch/test','https://user:pass@www.hulu.com/watch/test','http://www.hulu.com/watch/test','https://www.hulu.com:444/watch/test','https://www.hulu.com/account','file:///watch/test','https://tv.youtube.com/watch/test']) {
  assert.equal(resumeUrl('hulu',value),null,value);
}
controller.capture('https://www.hulu.com/login');assert.equal(controller.target(),HOMES.hulu,'login fallback');
controller.capture('https://www.hulu.com/watch/channel');controller.choose('peacock');assert.equal(controller.target(),HOMES.peacock,'new provider clears old channel');
controller.capture('https://www.peacocktv.com/watch/playback/live/channel');controller.reset();config={};assert.equal(controller.target(),HOMES.youtube,'pairing reset');
const fs=require('node:fs'),path=require('node:path');
const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
assert.match(main,/streamPairingToken===config.tvToken/);
assert.match(main,/const streamUrl = gameDayProvider.target\(\)/);
assert.doesNotMatch(main,/const streamUrl = options.streamUrl/);
const {applyRemoteCommand}=require('../src/provider-remote');
applyRemoteCommand({type:'saved_url',url:HOMES.hulu},{canControl:()=>true,openProvider(){throw Error('must not open URL');}}).then(result=>{
  assert.equal(result,'unavailable');console.log('PASS provider resume, restart scope, URL privacy, pairing reset and deprecated URL rejection');
}).catch(error=>{console.error(error);process.exitCode=1;});
