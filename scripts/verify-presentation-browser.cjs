// Optional browser integration: pass an installed Playwright package path as argv[2].
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const receiver = await context.newPage();
    const errors = []; receiver.on('pageerror', error => errors.push(error.message));
    let offer = null, answer = null, receiverStatus = null;
    await receiver.exposeFunction('fixtureSignal', async value => {
      if (value?.type === 'answer') { answer = value; return {}; }
      return { offer, has_answer: Boolean(answer), ice_servers: [], device_name: 'myREWRD Demo TV' };
    });
    await receiver.exposeFunction('fixtureStatus', value => { receiverStatus = value; });
    await receiver.addInitScript(() => { window.presentation = { signal: value => window.fixtureSignal(value), status: value => window.fixtureStatus(value) }; });
    await receiver.goto(pathToFileURL(path.join(__dirname, '../src/pages/presentation.html')).href);
    await receiver.getByText('Ready to present', { exact: true }).waitFor();
    const output = process.argv[3] || require('node:os').tmpdir();
    await receiver.screenshot({ path: path.join(output, 'presentation-waiting.png') });
    const sender = await context.newPage();
    await sender.goto('about:blank');
    offer = await sender.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      document.body.appendChild(canvas); const graphics = canvas.getContext('2d'); let frame = 0;
      setInterval(() => { graphics.fillStyle = '#123748'; graphics.fillRect(0,0,1280,720); graphics.fillStyle = '#42d3e6'; graphics.fillRect((frame++ * 10) % 1100, 200, 150,150); graphics.font = '48px sans-serif'; graphics.fillText('myREWRD synthetic screen test', 100,100); }, 100);
      const peer = window.fixturePeer = new RTCPeerConnection();
      const stream = canvas.captureStream(10); stream.getTracks().forEach(track => peer.addTrack(track,stream));
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise(resolve => { if (peer.iceGatheringState === 'complete') resolve(); else peer.onicegatheringstatechange = () => { if (peer.iceGatheringState === 'complete') resolve(); }; });
      return peer.localDescription.toJSON();
    });
    const deadline = Date.now() + 25000;
    while (!answer && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok(answer, 'receiver produced an answer');
    await sender.evaluate(value => window.fixturePeer.setRemoteDescription(value), answer);
    try { await receiver.waitForFunction(() => document.getElementById('screen').videoWidth > 0 && document.getElementById('screen').getVideoPlaybackQuality().totalVideoFrames > 1, null, { timeout: 15000 }); }
    catch (error) {
      console.log('Receiver diagnostics', await receiver.evaluate(() => ({ status, busy, answerDelivered, connection: peer?.connectionState, ice: peer?.iceConnectionState, videoWidth: document.getElementById('screen').videoWidth, label: document.getElementById('status').textContent })));
      console.log('Sender diagnostics', await sender.evaluate(() => ({ connection: window.fixturePeer.connectionState, ice: window.fixturePeer.iceConnectionState })));
      console.log('Page errors', errors);
      await receiver.screenshot({ path: path.join(output, 'presentation-failure.png') }); throw error;
    }
    await receiver.screenshot({ path: path.join(output, 'presentation-sharing.png') });
    assert.equal(receiverStatus, 'connected'); assert.deepEqual(errors, []);
    await sender.evaluate(() => window.fixturePeer.close());
    console.log('Real Edge WebRTC: synthetic moving canvas offer/answer, multiple decoded video frames, connected status, and zero receiver page errors passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
