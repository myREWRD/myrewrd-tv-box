const assert=require('node:assert/strict');
const {createLiveInputQueue}=require('../src/live-input-queue');
const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
(async()=>{
  let release;const applied=[],acks=[];
  const queue=createLiveInputQueue(async value=>{applied.push(value.seq);if(value.seq===1)await new Promise(r=>release=r);return true;},r=>acks.push(r));
  const move=seq=>({seq,command:{type:'point',x:0.5,y:0.5,click:false}});
  queue.push(move(1));for(let i=2;i<=25;i++)queue.push(move(i));
  queue.push({seq:26,command:{type:'mute',muted:true}});queue.push(move(27));
  queue.push({seq:28,command:{type:'point',x:0.5,y:0.5,click:true}});
  release();await settle();assert.deepEqual(applied,[1,26,27,28]);assert.ok(acks.some(a=>a.seq===26&&a.applied));
  let unblock;const saturated=[];
  const full=createLiveInputQueue(()=>new Promise(r=>unblock=r),r=>saturated.push(r));
  for(let i=1;i<=10;i++)full.push({seq:i,command:{type:'key',key:'Space'}});
  assert.deepEqual(saturated,[{seq:10,applied:false}]);full.stop();unblock(true);await settle();assert.equal(saturated.length,1);
  console.log('PASS hover flood preserves click/mute sequence, bounded discrete overflow is acknowledged, teardown drops pending input');
})().catch(e=>{console.error(e);process.exitCode=1;});
