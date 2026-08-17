// background.js — Service Worker that polls /api/tv-box-command every 5 seconds
// and sends messages to the content script to show/hide the sponsor overlay

const POLL_INTERVAL_MS = 5000;
let pollTimer = null;
let lastMode = null;

// Get the stored TV token
async function getToken() {
  const data = await chrome.storage.local.get(["tvToken"]);
  return data.tvToken || null;
}

// Poll the API for current mode
async function pollCommand() {
  const token = await getToken();
  if (!token) return;

  try {
    const res = await fetch(`https://app.myrewrd.com/api/tv-box-command?token=${token}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();

    // Store the current state
    await chrome.storage.local.set({
      currentMode: data.mode,
      showOverlay: data.show_overlay,
      overlayText: data.overlay_text,
      sponsorName: data.sponsor_name,
      sponsorLogo: data.sponsor_logo,
      tvBoardUrl: data.tv_board_url,
      streamUrl: data.stream_url,
    });

    // Send message to all tabs with content script
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
      } catch (e) {
        // Tab might not have content script loaded
      }
    }

    // If mode changed, handle navigation
    if (lastMode && lastMode !== data.mode) {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs[0]) {
        if (data.mode === "regular" && data.tv_board_url) {
          // Switch back to TV Board
          chrome.tabs.update(activeTabs[0].id, { url: data.tv_board_url });
        }
        // For stream/gameday, the venue navigates to their streaming service manually
        // The overlay will auto-activate on whatever page they're on
      }
    }
    lastMode = data.mode;
  } catch (e) {
    console.error("[myREWRD] Poll error:", e);
  }
}

// Start polling
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollCommand, POLL_INTERVAL_MS);
  pollCommand(); // Initial poll
}

// Listen for token changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tvToken) {
    lastMode = null;
    startPolling();
  }
});

// Start on install/update
chrome.runtime.onInstalled.addListener(() => {
  startPolling();
});

// Start on service worker wake
startPolling();
