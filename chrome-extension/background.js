// background.js — Service Worker that polls /api/tv-box-command every 5 seconds
const POLL_INTERVAL_MS = 5000;
let pollTimer = null;
let lastMode = null;

async function getToken() {
  // First check chrome.storage.local (set via popup or config)
  const data = await chrome.storage.local.get(["tvToken"]);
  if (data.tvToken) return data.tvToken;
  
  // Fallback: try to read from config.json bundled with extension
  try {
    const res = await fetch(chrome.runtime.getURL("config.json"));
    if (res.ok) {
      const config = await res.json();
      if (config.token) {
        // Save it to storage so we don't read the file every time
        await chrome.storage.local.set({ tvToken: config.token });
        return config.token;
      }
    }
  } catch {}
  
  return null;
}

async function pollCommand() {
  const token = await getToken();
  if (!token) return;

  try {
    const res = await fetch(`https://app.myrewrd.com/api/tv-box-command?token=${token}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();

    await chrome.storage.local.set({
      currentMode: data.mode,
      showOverlay: data.show_overlay,
      overlayText: data.overlay_text,
      sponsorName: data.sponsor_name,
      sponsorLogo: data.sponsor_logo,
      tvBoardUrl: data.tv_board_url,
      streamUrl: data.stream_url,
    });

    // Send message to all tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: data.show_overlay ? "activate" : "deactivate",
          mode: data.mode,
          sponsor: {
            name: data.sponsor_name,
            logoUrl: data.sponsor_logo,
            text: data.overlay_text,
          },
        });
      } catch {}
    }

    // Handle mode changes — navigate back to TV Board when switching to regular
    if (lastMode && lastMode !== data.mode) {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs[0] && data.mode === "regular" && data.tv_board_url) {
        chrome.tabs.update(activeTabs[0].id, { url: data.tv_board_url });
      }
    }
    lastMode = data.mode;
  } catch (e) {
    console.error("[myREWRD] Poll error:", e);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollCommand, POLL_INTERVAL_MS);
  pollCommand();
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.tvToken) { lastMode = null; startPolling(); }
});

chrome.runtime.onInstalled.addListener(() => { startPolling(); });
startPolling();
