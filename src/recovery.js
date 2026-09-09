// Recovery never invents credentials or navigates back into an operator session.
function tokenFromBoardUrl(value, apiBase) {
  try {
    const url = new URL(value);
    if (url.origin !== apiBase || url.username || url.password) return null;
    return /^\/tv\/(tv_[a-f0-9]+)\/?$/.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}

function createRecovery({ restore, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let stopped = false;
  return {
    schedule(delay = 1000) {
      if (stopped || timer !== null) return;
      timer = setTimer(() => {
        timer = null;
        if (!stopped) restore();
      }, delay);
    },
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    stop() { this.cancel(); stopped = true; },
  };
}

module.exports = { tokenFromBoardUrl, createRecovery };
