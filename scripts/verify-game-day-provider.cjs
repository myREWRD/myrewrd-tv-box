const assert=require('node:assert/strict');
const {HOMES,resumeUrl,createGameDayProvider}=require('../src/game-day-provider');
let config={},writes=[];
const controller=createGameDayProvider({getConfig:()=>config,save:data=>{writes.push(data);config={...config,...data};}});
assert.equal(controller.target(),HOMES.youtube);
assert.equal(controller.choose('__proto__'),null);
controller.choose('hulu');
controller.capture('https://www.hulu.com/watch/channel-123?secret=discard#also-discard');
assert.equal(controller.target(),'https://www.hulu.com/watch/channel-123');
assert.deepEqual(writes,[{gameDayProvider:'hulu'},{gameDayResumeUrls:{hulu:'https://www.hulu.com/watch/channel-123'}}]);
assert.equal(createGameDayProvider({getConfig:()=>config,save(){}}).target(),'https://www.hulu.com/watch/channel-123','restart restores sanitized provider playback route');
for(const value of ['https://www.hulu.com/login','https://auth.hulu.com/watch/test','https://www.hulu.com.evil.invalid/watch/test','https://user:pass@www.hulu.com/watch/test','http://www.hulu.com/watch/test','https://www.hulu.com:444/watch/test','https://www.hulu.com/account','file:///watch/test','https://tv.youtube.com/watch/test']) {
  assert.equal(resumeUrl('hulu',value),null,value);
}
controller.capture('https://www.hulu.com/login');assert.equal(controller.target(),'https://www.hulu.com/watch/channel-123','sign-in does not overwrite a safe saved playback route');
controller.capture('https://www.hulu.com/watch/channel');controller.choose('peacock');assert.equal(controller.target(),HOMES.peacock,'new provider clears old channel');
controller.capture('https://www.peacocktv.com/watch/playback/live/channel');assert.equal(controller.choose('hulu'),'https://www.hulu.com/watch/channel','switch back restores Hulu');assert.equal(controller.choose('peacock'),'https://www.peacocktv.com/watch/playback/live/channel','each provider keeps its own route');controller.reset();config={};assert.equal(controller.target(),HOMES.youtube,'pairing reset');
const fs=require('node:fs'),path=require('node:path');
const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
assert.match(main,/streamPairingToken===config.tvToken/);
assert.match(main,/const streamUrl = gameDayProvider.target\(\)/);
assert.doesNotMatch(main,/const streamUrl = options.streamUrl/);
const {applyRemoteCommand}=require('../src/provider-remote');
applyRemoteCommand({type:'saved_url',url:HOMES.hulu},{canControl:()=>true,openProvider(){throw Error('must not open URL');}}).then(result=>{
  assert.equal(result,'unavailable');console.log('PASS provider resume, restart scope, URL privacy, pairing reset and deprecated URL rejection');
}).catch(error=>{console.error(error);process.exitCode=1;});

const espnLive='https://www.espn.com/watch/player/_/id/game-123/startOption/live';
assert.equal(resumeUrl('espn',espnLive+'?token=discard#discard'),espnLive);
for(const suffix of ['/startOption/account','/startOption/live/extra','/startOption/','/signin'])assert.equal(resumeUrl('espn','https://www.espn.com/watch/player/_/id/game-123'+suffix),null);
assert.equal(resumeUrl('espn',espnLive.replace('www.espn.com','auth.espn.com')),null);
controller.choose('espn');controller.capture(espnLive);controller.choose('hulu');assert.equal(controller.choose('espn'),espnLive);

for(const [id,url] of Object.entries({youtube:'https://tv.youtube.com/watch/channel1',hulu:'https://www.hulu.com/watch/channel-1',peacock:'https://www.peacocktv.com/watch/playback/live/channel-1',espn:espnLive})){
 controller.choose(id);controller.capture(url+'?secret=discard#private');
 const restored=createGameDayProvider({getConfig:()=>config,save(){}});
 assert.equal(restored.target(),url,id+' restart restores its own destination');
}
const polluted=createGameDayProvider({getConfig:()=>({gameDayProvider:'hulu',gameDayResumeUrls:{hulu:'https://auth.hulu.com/login?token=secret',youtube:'https://evil.test/watch/a'}}),save(){}});
assert.equal(polluted.target(),HOMES.hulu,'invalid persisted routes never navigate');
assert.match(main,/gameDayResumeUrls:null/,'unpair clears persisted destinations');
assert.match(main,/did-navigate-in-page.*capturePlayback/,'SPA channel changes captured');

assert.equal(resumeUrl('hulu','https://www.hulu.com/live?discard=secret#private'),'https://www.hulu.com/live');
for(const bad of ['https://www.hulu.com/live/account','https://auth.hulu.com/live','https://www.hulu.com/liveness'])assert.equal(resumeUrl('hulu',bad),null);
controller.choose('hulu');controller.capture('https://www.hulu.com/live');controller.choose('espn');assert.equal(controller.choose('hulu'),'https://www.hulu.com/live');
assert.equal(createGameDayProvider({getConfig:()=>config,save(){}}).target(),'https://www.hulu.com/live');

assert.equal(HOMES.youtube,'https://tv.youtube.com/');
assert.equal(HOMES.youtube_video,'https://www.youtube.com/');
assert.equal(resumeUrl('youtube_video','https://www.youtube.com/watch?v=1FwetWkAkdc&token=private#fragment'),'https://www.youtube.com/watch?v=1FwetWkAkdc');
assert.equal(resumeUrl('youtube_video','https://www.youtube.com/watch?v=1FwetWkAkdc&v=aaaaaaaaaaa'),null);
assert.equal(resumeUrl('youtube_video','https://www.youtube.com/live/1FwetWkAkdc?secret=x'),'https://www.youtube.com/live/1FwetWkAkdc');
assert.equal(resumeUrl('youtube','https://www.youtube.com/watch?v=1FwetWkAkdc'),null);
assert.equal(resumeUrl('youtube_video','https://tv.youtube.com/watch/test'),null);
assert.equal(resumeUrl('youtube_video','https://www.youtube.com/account?v=1FwetWkAkdc'),null);
