// myREWRD TV Box — Main Electron Process
// Manages: pairing, mode switching, WebSocket control, DRM streaming, sponsor overlay

const { app, BrowserWindow, BrowserView, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");

// ─── Config & State ─────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const API_BASE = "https://app.myrewrd.com";

let mainWindow = null;
let streamView = null; // BrowserView for streaming content (YouTube TV, Hulu, etc.)
let overlayWindow = null; // Transparent overlay for sponsor bar
let ws = null;
let config = loadConfig();
let currentMode = "regular"; // 'regular' | 'stream' | 'gameday'
let sponsorData = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load config:", e);
  }
  return { tvToken: null, venueId: null, venueName: null, paired: false };
}

function saveConfig(data) {
  config = { ...config, ...data };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── Widevine DRM Support ───────────────────────────────────────────────────
// Electron supports Widevine out of the box on most platforms.
// This enables YouTube TV, Hulu, ESPN+, Peacock, Amazon Prime to play DRM content.
app.commandLine.appendSwitch("enable-features", "PlatformEncryptedDolbyVision");

// ─── Window Management ──────────────────────────────────────────────────────
function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,
    frame: false,
    kiosk: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Start in pairing mode or regular TV board
  if (!config.paired || !config.tvToken) {
    mainWindow.loadFile(path.join(__dirname, "pages", "pairing.html"));
  } else {
    switchMode(currentMode);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Mode Switching ─────────────────────────────────────────────────────────
function switchMode(mode, options = {}) {
  currentMode = mode;
  console.log(`[TV Box] Switching to mode: ${mode}`, options);

  // Remove any existing stream view
  if (streamView) {
    mainWindow.removeBrowserView(streamView);
    streamView.webContents.destroy();
    streamView = null;
  }

  // Close overlay if exists
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  }

  switch (mode) {
    case "regular":
      // Load the standard TV board URL
      const tvUrl = `${API_BASE}/tv/${config.tvToken}`;
      mainWindow.loadURL(tvUrl);
      break;

    case "stream":
      // Load the TV board in stream mode (existing functionality)
      const streamTvUrl = `${API_BASE}/tv/${config.tvToken}`;
      mainWindow.loadURL(streamTvUrl);
      break;

    case "gameday":
      // Game Day Mode: Full-screen stream + sponsor overlay at bottom
      startGameDayMode(options);
      break;

    case "streaming-login":
      // Open a streaming service for the venue to log in
      const serviceUrl = options.url || "https://tv.youtube.com";
      mainWindow.loadURL(serviceUrl);
      break;

    default:
      mainWindow.loadURL(`${API_BASE}/tv/${config.tvToken}`);
  }
}

// ─── Game Day Mode ──────────────────────────────────────────────────────────
function startGameDayMode(options = {}) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const sponsorBarHeight = Math.round(height * 0.06); // 6% of screen for sponsor bar
  const streamHeight = height - sponsorBarHeight;

  // Main window shows the sponsor bar at the bottom
  mainWindow.loadFile(path.join(__dirname, "pages", "gameday-sponsor.html"));

  // Create a BrowserView for the stream content (fills top 94%)
  streamView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      plugins: true, // Enable plugins for DRM
    },
  });

  mainWindow.addBrowserView(streamView);
  streamView.setBounds({ x: 0, y: 0, width, height: streamHeight });
  streamView.setAutoResize({ width: true, height: false });

  // Load the stream URL or YouTube TV
  const streamUrl = options.streamUrl || "https://tv.youtube.com";
  streamView.webContents.loadURL(streamUrl);

  // Fetch and display sponsor data
  fetchSponsorData();
}

// ─── Sponsor Data ───────────────────────────────────────────────────────────
async function fetchSponsorData() {
  if (!config.tvToken) return;
  try {
    const fetch = (await import("node-fetch")).default;
    const res = await fetch(
      `${API_BASE}/api/tv-sponsor?token=${config.tvToken}`
    );
    const data = await res.json();
    if (data.ok && data.found) {
      sponsorData = data.sponsor;
      // Send to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("sponsor-update", sponsorData);
      }
    }
  } catch (e) {
    console.error("[TV Box] Failed to fetch sponsor:", e);
  }
}

// Refresh sponsor data every 5 minutes
setInterval(fetchSponsorData, 5 * 60 * 1000);

// ─── WebSocket Connection (Real-time Dashboard Control) ─────────────────────
function connectWebSocket() {
  if (!config.tvToken) return;

  const wsUrl = `wss://app.myrewrd.com/api/tv-ws?token=${config.tvToken}`;
  console.log("[TV Box] Connecting WebSocket...");

  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("[TV Box] WebSocket connected");
    // Send heartbeat with current state
    sendState();
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleCommand(msg);
    } catch (e) {
      console.error("[TV Box] Invalid WebSocket message:", e);
    }
  });

  ws.on("close", () => {
    console.log("[TV Box] WebSocket disconnected, reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => {
    console.error("[TV Box] WebSocket error:", err.message);
  });
}

function sendState() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "state",
        mode: currentMode,
        paired: config.paired,
        venueName: config.venueName,
        version: app.getVersion(),
      })
    );
  }
}

// ─── Command Handler (from Dashboard/App) ───────────────────────────────────
function handleCommand(msg) {
  console.log("[TV Box] Received command:", msg.type);

  switch (msg.type) {
    case "switch_mode":
      switchMode(msg.mode, msg.options || {});
      break;

    case "set_stream_url":
      if (currentMode === "gameday" && streamView) {
        streamView.webContents.loadURL(msg.url);
      }
      break;

    case "open_service":
      // Open a streaming service for login
      switchMode("streaming-login", { url: msg.url });
      break;

    case "navigate":
      // Navigate the stream view to a specific URL
      if (streamView) {
        streamView.webContents.loadURL(msg.url);
      }
      break;

    case "refresh":
      if (mainWindow) mainWindow.webContents.reload();
      if (streamView) streamView.webContents.reload();
      break;

    case "volume":
      // Set volume (0-100)
      if (streamView) {
        streamView.webContents.setAudioMuted(msg.muted || false);
      }
      break;

    case "pair":
      // Pairing confirmation from server
      saveConfig({
        tvToken: msg.tvToken,
        venueId: msg.venueId,
        venueName: msg.venueName,
        paired: true,
      });
      switchMode("regular");
      break;

    case "unpair":
      saveConfig({ tvToken: null, venueId: null, venueName: null, paired: false });
      mainWindow.loadFile(path.join(__dirname, "pages", "pairing.html"));
      break;

    case "ping":
      sendState();
      break;

    default:
      console.log("[TV Box] Unknown command:", msg.type);
  }
}

// ─── IPC Handlers (from renderer pages) ─────────────────────────────────────
ipcMain.handle("get-config", () => config);
ipcMain.handle("get-mode", () => currentMode);
ipcMain.handle("get-sponsor", () => sponsorData);

ipcMain.on("pair-with-token", (event, token) => {
  saveConfig({ tvToken: token, paired: true });
  connectWebSocket();
  switchMode("regular");
});

ipcMain.on("switch-mode", (event, mode, options) => {
  switchMode(mode, options);
});

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();

  if (config.paired && config.tvToken) {
    connectWebSocket();
    fetchSponsorData();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// ─── Auto-restart on crash ──────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[TV Box] Uncaught exception:", err);
  // Don't crash — just log and continue
});
