const fs = require('node:fs');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {spawn} = require('node:child_process');

async function launchResetHelper({helper, journal, executable, plain, parentPid = process.pid, launch = spawn, timeoutMs = 10000}) {
  const nonce = randomBytes(32).toString('hex');
  const receipt = path.join(path.dirname(journal), 'cleanup-ready.json');
  const approval = path.join(path.dirname(journal), 'cleanup-go.json');
  for(const file of [receipt,approval]) {plain(file); if(fs.existsSync(file)) fs.unlinkSync(file);}
  const child = launch(helper, ['reset', journal, String(parentPid), executable, nonce], {detached:true, windowsHide:true, stdio:'ignore'});
  await new Promise((resolve, reject) => {
    let finished = false, timer;
    const stop = error => {
      if (finished) return;
      finished = true; clearInterval(timer);
      if (error) {try {child.kill();} catch {} reject(Error('Reset helper did not become ready. Local cleanup remains incomplete.'));}
      else resolve();
    };
    child.once('error', () => stop(true));
    child.once('exit', code => {if(code !== 0) stop(true);});
    const deadline = Date.now() + timeoutMs;
    timer = setInterval(() => {
      try {
        if (fs.existsSync(receipt)) {
          plain(receipt);
          if(fs.statSync(receipt).size > 1024) {stop(true); return;}
          const value = JSON.parse(fs.readFileSync(receipt, 'utf8'));
          if(value.phase !== 'helper-ready' || value.nonce !== nonce || value.parent_pid !== parentPid) {stop(true); return;}
          stop(false); return;
        }
      } catch {stop(true); return;}
      if(Date.now() >= deadline) stop(true);
    }, 50);
  });
  plain(approval); plain(approval+'.tmp');
  fs.writeFileSync(approval+'.tmp',JSON.stringify({phase:'handoff-approved',nonce,parent_pid:parentPid}));
  fs.renameSync(approval+'.tmp',approval);
  child.unref();
  return child;
}
module.exports = {launchResetHelper};
