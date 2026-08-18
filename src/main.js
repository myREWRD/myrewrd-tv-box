// myREWRD TV Box — Main Electron Process
// Manages: pairing, mode switching, HTTP polling control, DRM streaming, sponsor overlay, auto-update

const { app, BrowserWindow, BrowserView, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const https = require("https");
const http = require("http");

// ─── Config & State ─────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const API_BASE = "https://app.myrewrd.com";
const APP_VERSION = app.getVersion(); // reads from package.json "version"
const INSTALL_DIR = "C:\\Users\\myrewrd\\myREWRD-TV-Box";

let mainWindow = null;
let streamView = null; // BrowserView for streaming content (YouTube TV, Hulu, etc.)
let overlayWindow = null; // Transparent overlay for sponsor bar
let config = loadConfig();
let currentMode = "regular"; // 'regular' | 'stream' | 'gameday'
let sponsorData = null;
let isUpdating = false; // Prevent multiple simultaneous updates

function loadConfig() {
  // Check primary location (AppData)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load config from AppData:", e);
  }
  // Check all possible locations where .bat setup script writes config.json
  const searchPaths = [
    path.join(path.dirname(process.execPath), "config.json"),
    "C:\\Users\\myrewrd\\myREWRD-TV-Box\\config.json",
    path.join(process.env.USERPROFILE || "", "myREWRD-TV-Box", "config.json"),
  ];
  for (const p of searchPaths) {
    try {
      if (p && fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (data.tvToken) {
          // Migrate to AppData location for future reads
          fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
          console.log("[TV Box] Found config at", p, "- migrated to AppData");
          return data;
        }
      }
    } catch (e) {
      console.error("Failed to load config from", p, e);
    }
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
    mainWindow.loadURL(`${API_BASE}/tv/pair`);
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

// ─── HTTP Polling (Dashboard Control) ────────────────────────────────────────
let pollInterval = null;
function startPolling() {
  if (!config.tvToken) return;
  console.log("[TV Box] Starting HTTP polling for commands...");
  pollForCommands();
  pollInterval = setInterval(pollForCommands, 5000);
}

async function pollForCommands() {
  if (!config.tvToken) return;
  try {
    const res = await fetch(
      `${API_BASE}/api/tv-box-command?token=${config.tvToken}`
    );
    if (!res.ok) return;
    const data = await res.json();

    // Handle pending command from venue app (e.g., navigate to Hulu)
    if (data.pending_command) {
      let cmd;
      try {
        cmd = typeof data.pending_command === "string"
          ? JSON.parse(data.pending_command)
          : data.pending_command;
      } catch { cmd = null; }

      if (cmd && cmd.type) {
        console.log("[TV Box] Received command:", cmd.type, cmd.url || "");
        handleCommand(cmd);
        // Acknowledge command (clear it from DB)
        fetch(`${API_BASE}/api/tv-box-command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: config.tvToken, action: "ack_command" }),
        }).catch(() => {});
      }
    }

    // Handle mode changes from dashboard/app
    if (data.mode && data.mode !== currentMode) {
      console.log("[TV Box] Mode changed:", currentMode, "->", data.mode);
      const options = {};
      if (data.stream_url) options.streamUrl = data.stream_url;
      if (data.sponsor_name) options.sponsorName = data.sponsor_name;
      if (data.sponsor_logo) options.sponsorLogo = data.sponsor_logo;
      if (data.overlay_text) options.overlayText = data.overlay_text;
      switchMode(data.mode, options);
    }

    // Check for updates
    if (data.latest_version && data.update_url) {
      checkForUpdate(data.latest_version, data.update_url, data.force_update);
    }
  } catch (e) {
    console.error("[TV Box] Poll error:", e.message);
  }
}

// ─── Auto-Update System ─────────────────────────────────────────────────────
function compareVersions(current, latest) {
  const c = current.split(".").map(Number);
  const l = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return 1;  // latest is newer
    if ((l[i] || 0) < (c[i] || 0)) return -1; // current is newer
  }
  return 0; // same
}

async function checkForUpdate(latestVersion, downloadUrl, forceUpdate) {
  if (isUpdating) return;
  if (compareVersions(APP_VERSION, latestVersion) <= 0) return; // already up to date

  console.log(`[TV Box] Update available: ${APP_VERSION} -> ${latestVersion}`);
  isUpdating = true;

  try {
    const newExeName = `myREWRD.TV.Box.${latestVersion}.exe`;
    const downloadPath = path.join(INSTALL_DIR, newExeName + ".downloading");
    const finalPath = path.join(INSTALL_DIR, newExeName);

    // Download the new exe
    console.log("[TV Box] Downloading update from:", downloadUrl);
    await downloadFile(downloadUrl, downloadPath);

    // Verify download (must be > 10MB to be valid)
    const stats = fs.statSync(downloadPath);
    if (stats.size < 10 * 1024 * 1024) {
      console.error("[TV Box] Downloaded file too small, aborting update");
      fs.unlinkSync(downloadPath);
      isUpdating = false;
      return;
    }

    // Rename download to final name
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    fs.renameSync(downloadPath, finalPath);
    console.log("[TV Box] Update downloaded successfully:", finalPath);

    // Update the startup shortcut to point to new exe
    const startupDir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    const batPath = path.join(startupDir, "myREWRD-TV-Box.bat");
    fs.writeFileSync(batPath, `@echo off\r\nstart "" "${finalPath}"\r\n`);

    // Remove old exe (current running one will be removed after restart)
    const currentExe = process.execPath;
    const oldExeName = path.basename(currentExe);
    if (oldExeName !== newExeName) {
      // Schedule deletion of old exe after restart
      const cleanupBat = path.join(INSTALL_DIR, "cleanup.bat");
      fs.writeFileSync(cleanupBat,
        `@echo off\r\nping 127.0.0.1 -n 3 >nul\r\ndel "${currentExe}" 2>nul\r\ndel "%~f0"\r\n`
      );
    }

    console.log("[TV Box] Restarting with new version...");
    // Launch new exe and quit current
    execFile(finalPath, { detached: true, stdio: "ignore" });
    app.quit();

  } catch (e) {
    console.error("[TV Box] Update failed:", e.message);
    isUpdating = false;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (url.startsWith("https") ? https : http).get(url, (response) => {
      // Handle redirects (GitHub releases redirect)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    });
    request.on("error", (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    request.setTimeout(300000, () => { // 5 min timeout
      request.destroy();
      reject(new Error("Download timeout"));
    });
  });
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
      if (streamView && streamView.webContents) {
        streamView.webContents.loadURL(msg.url);
      } else {
        // If no stream view exists, load URL in main window
        mainWindow.loadURL(msg.url);
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
      mainWindow.loadURL(`${API_BASE}/tv/pair`);
      break;

    case "ping":
      // No-op for HTTP polling
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
  startPolling();
  switchMode("regular");
});

ipcMain.on("switch-mode", (event, mode, options) => {
  switchMode(mode, options);
});

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();

  // Watch for navigation from /tv/pair to /tv/[token] (pairing complete)
  mainWindow.webContents.on("did-navigate", (event, url) => {
    const tvMatch = url.match(/\/tv\/(tv_[a-f0-9]+)/);
    if (tvMatch && tvMatch[1] && !config.paired) {
      const token = tvMatch[1];
      saveConfig({ tvToken: token, paired: true });
      console.log("[TV Box] Paired via PIN! Token:", token);
      startPolling();
      fetchSponsorData();
    }
  });

  if (config.paired && config.tvToken) {
    startPolling();
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
