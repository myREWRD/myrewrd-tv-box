// Real Windows ECS/EME probe using an isolated profile and a hidden fixture page.
// This proves CDM availability, NOT YouTube TV entitlement or production VMP acceptance.
const { app, BrowserWindow, BrowserView, session, components } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const profile = process.argv[2];
if (!profile || !path.isAbsolute(profile)) throw Error('An absolute isolated profile directory is required');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile); app.setPath('sessionData', profile);
const resultPath = path.join(profile, 'probe-result.json');
const fail = reason => { fs.writeFileSync(resultPath, JSON.stringify({ ok: false, reason })); app.exit(1); };
const timeout = setTimeout(() => fail('timeout'), 60000);
app.whenReady().then(async () => {
  assert.equal(typeof BrowserView, 'function');
  assert.ok(components?.WIDEVINE_CDM_ID, 'ECS components API must exist');
  session.defaultSession.protocol.handle('https', request => {
    if (new URL(request.url).hostname !== 'myrewrd-playback-test.invalid') return Response.error();
    return new Response('<!doctype html><title>Protected playback fixture</title>', { headers: { 'content-type': 'text/html' } });
  });
  const window = new BrowserWindow({ show: false, width: 1920, height: 1080 });
  const view = new BrowserView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, disableHtmlFullscreenWindowResize: true } });
  window.addBrowserView(view); view.setBounds({ x: 0, y: 0, width: 1920, height: 1015 });
  await view.webContents.loadURL('https://myrewrd-playback-test.invalid');
  // Match Game Day: a status renderer exists before first component install.
  await components.whenReady([components.WIDEVINE_CDM_ID]);
  const result = await view.webContents.executeJavaScript(`(async () => {
    const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
      initDataTypes: ['cenc'],
      audioCapabilities: [{contentType:'audio/mp4; codecs="mp4a.40.2"'}],
      videoCapabilities: [{contentType:'video/mp4; codecs="avc1.42E01E"'}],
    }]);
    await access.createMediaKeys();
    return {keySystem:access.keySystem, node:typeof require};
  })()`);
  assert.equal(result.keySystem, 'com.widevine.alpha'); assert.equal(result.node, 'undefined');
  assert.equal(view.getBounds().height, 1015);
  window.removeBrowserView(view); view.webContents.close(); window.destroy();
  clearTimeout(timeout);
  console.log('PASS Windows ECS component install, sandboxed H.264/AAC Widevine MediaKeys, BrowserView and sponsor bounds; provider playback/signing not tested');
  fs.writeFileSync(resultPath, JSON.stringify({ ok: true, keySystem: result.keySystem, providerPlaybackVerified: false }));
  app.exit(0);
}).catch(error => { fail(error.name); });
