const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/presentation.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function boot({ gather = true, failAnswer = false, alreadyAnswered = false } = {}) {
  let answerCalls = 0, restartCalls = 0, peers = 0, fail = failAnswer;
  const timers = new Map();
  class Peer {
    constructor() { peers++; this.iceGatheringState = gather ? 'complete' : 'gathering'; this.signalingState = 'stable'; }
    async setRemoteDescription() {}
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\nfixture' }; }
    async setLocalDescription(value) { this.localDescription = { toJSON: () => value }; }
    addEventListener() {} removeEventListener() {} close() { this.closed = true; }
  }
  const elements = Object.fromEntries(['screen','waiting','status','device'].map(id => [id, { hidden: false, textContent: '', play: async () => {} }]));
  const context = vm.createContext({ RTCPeerConnection: Peer, MediaStream: class {},
    document: { getElementById: id => elements[id] },
    window: { addEventListener() {}, presentation: { status() {}, async signal(value) {
      if (value?.type === 'restart') { restartCalls++; return {}; }
      if (value?.type === 'answer') { answerCalls++; if (fail) { fail = false; throw Error('network'); } return {}; }
      return { offer: { type: 'offer', sdp: 'v=0' }, has_answer: alreadyAnswered, ice_servers: [], device_name: 'Fixture' };
    } } },
    setInterval() {}, setTimeout(fn) { timers.set(1, fn); return 1; }, clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  return { context, timers, run: code => vm.runInContext(code, context), counts: () => ({ answerCalls, restartCalls, peers }) };
}
(async () => {
  const retry = boot({ failAnswer: true }); await settle();
  assert.equal(retry.counts().answerCalls, 1);
  assert.ok(retry.run('pendingAnswer'));
  await retry.run('poll()'); await settle();
  assert.equal(retry.counts().answerCalls, 2);
  assert.equal(retry.run('answerDelivered'), true);
  assert.equal(retry.counts().peers, 1);
  retry.run('video.srcObject = {}; peer.connectionState = "disconnected"; peer.onconnectionstatechange()');
  assert.equal(retry.run('video.hidden'), true);
  retry.run('peer.connectionState = "connected"; peer.onconnectionstatechange()');
  assert.equal(retry.run('video.hidden'), false); assert.equal(retry.run('waiting.hidden'), true);
  const timeout = boot({ gather: false }); await settle();
  assert.equal(timeout.run('peer.signalingState'), 'stable');
  timeout.timers.get(1)(); await settle();
  assert.equal(timeout.run('peer'), null, 'ICE timeout must discard incomplete peer even in stable signaling state');
  timeout.run('poll()'); await settle(); assert.equal(timeout.counts().peers, 2);
  const recovery = boot({ alreadyAnswered: true }); await settle();
  assert.equal(recovery.counts().restartCalls, 1); assert.equal(recovery.counts().peers, 0);
  console.log('Receiver: answer retry, ICE timeout retry, and crashed-session renewal passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
