const assert=require('node:assert/strict');
const {boot,settle}=require('./verify-wake-recovery.cjs');
(async()=>{
  const box=boot({paired:true,tvToken:'fixture-token'});await settle();
  box.run('app.relaunch = options => { globalThis.restartArgs=options.args; }; app.quit = () => { globalThis.restarted=true; };');
  for(const guard of ['isUpdating','handoffRequested']) {
    box.run(`${guard}=true`);assert.equal(box.run('requestRemoteRestart()'),'unavailable');box.run(`${guard}=false`);
  }
  assert.equal(box.run('requestRemoteRestart()'),'applied');assert.equal(box.run('requestRemoteRestart()'),'unavailable');
  assert.equal(box.run('globalThis.restarted'),undefined);box.fire(2000);assert.equal(box.run('globalThis.restarted'),true);
  assert.equal(JSON.stringify(box.run('globalThis.restartArgs')),'[]','never replay update job arguments');
  const unpaired=boot(null);await settle();assert.equal(unpaired.run('requestRemoteRestart()'),'unavailable');
  const revoked=boot({paired:true,tvToken:'fixture-token'});await settle();
  revoked.run('app.quit = () => { globalThis.restarted=true; };');
  assert.equal(revoked.run('requestRemoteRestart()'),'applied');revoked.run('config.paired=false');revoked.fire(2000);
  assert.equal(revoked.run('globalThis.restarted'),undefined,'unpairing cancels a scheduled restart');
  console.log('PASS selected-app restart is delayed, single-shot, blocks update/handoff/unpaired state and clears updater arguments');
})().catch(e=>{console.error(e);process.exitCode=1;});
