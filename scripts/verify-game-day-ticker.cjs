const assert=require('node:assert/strict');
const {createGameDayTicker}=require('../src/game-day-ticker');
(async()=>{
 let token='venue-a', output, response={ok:true,json:async()=>({ok:true,messages:[{id:'1',message:'<img onerror=alert(1)>',private:'discard'},{id:'2',message:''},null]})};
 let calls=[];
 const feed=createGameDayTicker({getToken:()=>token,apiBase:'https://app.myrewrd.com',publish:m=>output=m,fetch:async(url,options)=>{calls.push({url,options});return response;}});
 await feed.refresh();assert.deepEqual(output,[{id:'1',message:'<img onerror=alert(1)>'}]);assert.equal(calls[0].url,'https://app.myrewrd.com/api/tv-ticker?token=venue-a');assert.ok(calls[0].options.signal);
 token='venue-b';assert.deepEqual(feed.current(),[]);
 response={ok:false};await feed.refresh();assert.deepEqual(output,[]);
 response={ok:true,json:async()=>({ok:true,messages:[]})};await feed.refresh();assert.deepEqual(output,[]);
 response={ok:true,json:async()=>({ok:true,messages:'bad'})};await feed.refresh();assert.deepEqual(output,[]);
 let resolve;response={ok:true,json:()=>new Promise(r=>resolve=r)};const pending=feed.refresh();await Promise.resolve();token='venue-c';resolve({ok:true,messages:[{id:'old',message:'Other venue'}]});await pending;assert.deepEqual(feed.current(),[]);
 token=null;await feed.refresh();assert.deepEqual(output,[]);
 const fs=require('node:fs');const html=fs.readFileSync('src/pages/game-day-ticker.js','utf8');assert.doesNotMatch(html,/innerHTML/);assert.match(html,/textContent=message.message/);
 console.log('Ticker feed: sanitized projection, timeout, empty/error clearing, venue change and stale response checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
