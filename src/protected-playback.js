// ECS installs Widevine from Google's component service. Never bundle/copy a CDM.
function createProtectedPlayback({ components, timeoutMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let pending;
  async function ready() {
    if (!components || typeof components.whenReady !== 'function' || !components.WIDEVINE_CDM_ID) {
      throw Error('Protected playback runtime unavailable');
    }
    // A timeout must not create concurrent component installations on the next retry.
    if (!pending) {
      pending = Promise.resolve().then(() => components.whenReady([components.WIDEVINE_CDM_ID]));
      pending.catch(() => { pending = undefined; });
    }
    let timer;
    try {
      await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimer(() => reject(Error('Protected playback preparation timed out')), timeoutMs);
      })]);
    } finally { clearTimer(timer); }
  }
  return { ready };
}
module.exports = { createProtectedPlayback };
