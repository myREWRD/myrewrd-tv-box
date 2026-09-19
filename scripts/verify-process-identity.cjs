const assert=require('node:assert/strict');
const fs=require('node:fs');
const {currentProcessIdentity}=require('../src/update');
const pid=123, created=1700000000000;
const app={getAppMetrics:()=>[{pid:456,type:'Browser',creationTime:created+1},{pid,type:'Browser',creationTime:created}]};
assert.deepEqual(currentProcessIdentity(app,pid,created+3600000),{parentPid:pid,parentStartedAt:created},'Use OS process creation, independent of delayed Node startup or uptime');
for(const metric of [undefined,{pid,type:'Tab',creationTime:created},{pid:456,type:'Browser',creationTime:created},{pid,type:'Browser',creationTime:NaN},{pid,type:'Browser',creationTime:0},{pid,type:'Browser',creationTime:created+2}]){
  assert.throws(()=>currentProcessIdentity({getAppMetrics:()=>metric?[metric]:[]},pid,created+1),/identity unavailable/);
}
const main=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
assert.match(main,/prepareUpdate\(\{ \.\.\.currentProcessIdentity\(app\)/);
const supervisor=fs.readFileSync(require.resolve('../src/update-supervisor.cs'),'utf8');
assert.match(supervisor,/Math\.Abs\(start-Convert\.ToDouble\(manifest\["parentStartedAt"\]\)\)>5000/);
console.log('PASS OS process identity, delayed startup, wrong PID/type, missing time and unchanged supervisor tolerance');
