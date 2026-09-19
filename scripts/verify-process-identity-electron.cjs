const {app}=require('electron');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {currentProcessIdentity}=require('../src/update');
app.whenReady().then(()=>{
  const identity=currentProcessIdentity(app);
  const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const actual=Number(execFileSync(powershell,['-NoProfile','-Command',`([DateTimeOffset](Get-Process -Id ${process.pid}).StartTime).ToUnixTimeMilliseconds()`],{windowsHide:true,encoding:'utf8'}).trim());
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual-identity.parentStartedAt)<100,'Electron and Windows must identify the same process creation time');
  console.log('PASS real Windows Electron creationTime matches OS process identity');
  app.exit(0);
}).catch(error=>{console.error(error.message);app.exit(1)});
