const PROVIDERS = { youtube: 'https://tv.youtube.com/', hulu: 'https://www.hulu.com/', peacock: 'https://www.peacocktv.com/', espn: 'https://www.espn.com/watch/' };
const KEYS = ['Up', 'Down', 'Left', 'Right', 'Return', 'Tab', 'ShiftTab', 'Escape', 'Space'];
function providerPage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port
    && ['youtube.com', 'hulu.com', 'peacocktv.com', 'espn.com'].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))
    && !u.hostname.startsWith('accounts.'); } catch { return false; }
}

// No desktop input, arbitrary text/JavaScript, screenshots or provider cookies.
async function applyRemoteCommand(command, { getView, canControl, openProvider, focus }) {
  if (!canControl() || !command || typeof command !== 'object') return 'unavailable';
  if (command.type === 'provider') {
    if (!Object.hasOwn(PROVIDERS, command.provider)) return 'unavailable';
    await openProvider(PROVIDERS[command.provider]); return 'applied';
  }
  const view = getView();
  const contents = view?.webContents;
  if (!contents || contents.isDestroyed() || !providerPage(contents.getURL()) || contents.isLoading()) return 'unavailable';
  focus(); contents.focus();
  switch (command.type) {
    case 'key': {
      if (!KEYS.includes(command.key)) return 'unavailable';
      const keyCode = command.key === 'ShiftTab' ? 'Tab' : command.key;
      const modifiers = command.key === 'ShiftTab' ? ['shift'] : [];
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      return 'applied';
    }
    case 'point': {
      if (![command.x, command.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) || typeof command.click !== 'boolean') return 'unavailable';
      const { width, height } = view.getBounds();
      const x = Math.round(command.x * (width - 1)), y = Math.round(command.y * (height - 1));
      contents.sendInputEvent({ type: 'mouseMove', x, y });
      // A fixed, isolated-world pointer marker helps the operator look at the TV.
      // The only interpolated values are bounded numbers; no DOM data is read.
      await contents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(() => {
        let p = document.getElementById('myrewrd-remote-pointer');
        if (!p) { p = document.createElement('div'); p.id = 'myrewrd-remote-pointer'; document.documentElement.appendChild(p); }
        p.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;width:20px;height:20px;border:3px solid white;border-radius:50%;background:#f97316;box-shadow:0 0 4px black;transform:translate(-50%,-50%);left:${x}px;top:${y}px';
        clearTimeout(globalThis.myrewrdPointerTimer); globalThis.myrewrdPointerTimer = setTimeout(() => p.remove(), 4000);
      })()` }]);
      if (!canControl() || getView() !== view || contents.isDestroyed() || !providerPage(contents.getURL())) return 'unavailable';
      if (command.click) {
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      }
      return 'applied';
    }
    case 'scroll':
      if (!['up', 'down'].includes(command.direction)) return 'unavailable';
      contents.sendInputEvent({ type: 'mouseWheel', x: Math.floor(view.getBounds().width / 2), y: Math.floor(view.getBounds().height / 2), deltaY: command.direction === 'up' ? 350 : -350 });
      return 'applied';
    case 'back':
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
      return 'applied';
    case 'reload': contents.reload(); return 'applied';
    case 'mute':
      if (typeof command.muted !== 'boolean') return 'unavailable';
      contents.setAudioMuted(command.muted); return 'applied';
    default: return 'unavailable';
  }
}

function createProviderRemote({ apiBase, getToken, getKey, canPoll, apply, fetcher = (...args) => fetch(...args), now = Date.now }) {
  let request = null, timer = null, activeUntil = 0, generation = 0, stopped = false;
  function stop() { stopped = true; generation++; request?.abort(); clearTimeout(timer); timer = null; activeUntil = 0; }
  async function tick() {
    if (stopped || request || !canPoll() || !getToken() || !getKey()) return;
    clearTimeout(timer); timer = null;
    const controller = new AbortController(), run = generation;
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 7000);
    const token = getToken(), key = getKey();
    const headers = { 'Content-Type': 'application/json', 'X-TV-Token': token, 'X-TV-Presentation-Key': key };
    const current = () => !controller.signal.aborted && run === generation && canPoll() && token === getToken() && key === getKey();
    try {
      const response = await fetcher(`${apiBase}/api/tv-remote`, { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ action: 'poll', protocol: 1 }) });
      if (!response.ok || !current()) return;
      const { command: envelope } = await response.json();
      if (!envelope || !current()) return;
      activeUntil = now() + 120000;
      if (!/^[a-f0-9-]{36}$/i.test(envelope.command_id || '')) return;
      let result = 'expired';
      const expires = Date.parse(envelope.expires_at || '');
      if (expires > now() && expires <= now() + 15000) {
        try { result = await apply(envelope.command); } catch { result = 'unavailable'; }
      }
      if (!current()) return;
      await fetcher(`${apiBase}/api/tv-remote`, { method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ action: 'report', command_id: envelope.command_id, result }) });
    } catch { /* A claimed command is never automatically replayed. */ }
    finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
      if (run === generation && canPoll() && now() < activeUntil) timer = setTimeout(tick, 1000);
    }
  }
  return { tick, stop, resume() { stopped = false; } };
}
module.exports = { applyRemoteCommand, createProviderRemote, providerPage };
