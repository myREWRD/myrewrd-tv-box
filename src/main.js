// myREWRD TV Box — Main Electron Process
// Manages: pairing, mode switching, HTTP polling control, DRM streaming, sponsor overlay, auto-update

const { app, BrowserWindow, BrowserView, ipcMain, screen, powerMonitor, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const { prepareUpdate, createCandidate, blockedVersion } = require("./update");
const { normalizeSponsorPayload } = require("./sponsor");
const { tokenFromBoardUrl, createRecovery } = require("./recovery");
const { allowedNavigation } = require("./navigation");
const { createPresentation } = require("./presentation");
const { loadPresentationKey, ensurePresentationKey } = require("./presentation-key");
const { createEnrollment } = require("./enrollment");
const { createRemoteStatus } = require("./remote-status");

// Recovery may race a completed restart if its result could not be written.
// Only one process may own this device profile and visible board.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => { if (mainWindow) restoreBoard(); });

function navigate(contents, url) {
  if (!allowedNavigation(url, API_BASE, config.tvToken)) return;
  contents.loadURL(url).catch(() => {});
}

function guardNavigation(contents) {
  for (const eventName of ["will-navigate", "will-redirect"]) {
    contents.on(eventName, (event, url) => {
      const completingPairing = !config.paired && contents === mainWindow?.webContents
        && contents.getURL() === `${API_BASE}/tv/pair`
        && Boolean(tokenFromBoardUrl(url, API_BASE));
      if (!completingPairing && !allowedNavigation(url, API_BASE, config.tvToken)) event.preventDefault();
    });
  }
  contents.setWindowOpenHandler(({ url }) => {
    if (!allowedNavigation(url, API_BASE, null) || new URL(url).origin === API_BASE) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, "provider-preload.js") },
      },
    };
  });
  contents.on("did-create-window", window => {
    providerWindows.add(window);
    guardNavigation(window.webContents);
    window.on("closed", () => providerWindows.delete(window));
  });
}

// ─── Config & State ─────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const API_BASE = "https://app.myrewrd.com";
const APP_VERSION = app.getVersion(); // reads from package.json "version"
const INSTALL_DIR = process.env.PORTABLE_EXECUTABLE_DIR || path.join(app.getPath("home"), "myREWRD-TV-Box");

let mainWindow = null;
let streamView = null; // BrowserView for streaming content (YouTube TV, Hulu, etc.)
let overlayWindow = null; // Transparent overlay for sponsor bar
let config = loadConfig();
let currentMode = "regular"; // 'regular' | 'stream' | 'gameday' | 'live-game'
let boardStatus = "connecting";
let configuredMode = "regular";
let sponsorData = null;
let isUpdating = false; // Prevent multiple simultaneous updates
let retryUpdateAfter = 0;
let handoffRequested = false;
let pollController = null;
const providerWindows = new Set();
let presentationKey = null;
const enrollment = createEnrollment({ BrowserWindow, apiBase: API_BASE, getToken: () => config.tvToken,
  ensureKey: () => {
    if (!presentationKey && safeStorage) presentationKey = ensurePresentationKey({ safeStorage, profile: app.getPath("userData"), installDir: INSTALL_DIR });
    return presentationKey;
  } });
const presentation = createPresentation({ BrowserWindow, ipcMain, apiBase: API_BASE,
  getToken: () => config.tvToken, getKey: () => presentationKey,
  onExit: () => { if (mainWindow && !mainWindow.isDestroyed()) switchMode("regular"); } });
const recovery = createRecovery({ restore: restoreBoard });
const updateCandidate = createCandidate({
  argv: process.argv || [], installRoot: INSTALL_DIR, profile: app.getPath("userData"), version: APP_VERSION, app,
  activate() { mainWindow.show(); mainWindow.focus(); startPolling(); fetchSponsorData(); },
});
const remoteStatus = createRemoteStatus({ apiBase: API_BASE, getToken: () => config.tvToken,
  getKey: () => presentationKey,
  canReport: () => Boolean(config.paired && !handoffRequested && (!updateCandidate || updateCandidate.active)) });

function restoreBoard() {
  if (handoffRequested || (updateCandidate && !updateCandidate.active)) return;
  for (const window of providerWindows) if (!window.isDestroyed()) window.close();
  // Discard responses begun before sleep; the server remains the mode authority.
  if (pollController) pollController.abort();
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  else switchMode("regular");
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setKiosk(true);
  mainWindow.setFullScreen(true);
  mainWindow.focus();
  startPolling();
}

function loadConfig() {
  // Check primary location (AppData)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load config from AppData");
  }
  // Check all possible locations where .bat setup script writes config.json
  const searchPaths = [
    path.join(INSTALL_DIR, "config.json"),
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
      console.error("Failed to load setup configuration");
    }
  }
  return { tvToken: null, venueId: null, venueName: null, paired: false };
}

function saveConfig(data) {
  config = { ...config, ...data };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
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
    show: !updateCandidate,
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

  guardNavigation(mainWindow.webContents);
  let boardNavigationSucceeded = false;
  mainWindow.webContents.on("did-navigate", (_event, url, responseCode) => {
    boardNavigationSucceeded = responseCode >= 200 && responseCode < 400
      && Boolean(config.paired && config.tvToken) && tokenFromBoardUrl(url, API_BASE) === config.tvToken;
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (config.tvToken && tokenFromBoardUrl(mainWindow.webContents.getURL(), API_BASE) === config.tvToken) boardStatus = "ready";
    if (updateCandidate && boardNavigationSucceeded
        && tokenFromBoardUrl(mainWindow.webContents.getURL(), API_BASE) === config.tvToken) updateCandidate.boardReady();
  });
  // Next.js pairing uses client-side routing: did-navigate alone misses it.
  const rememberPairing = (_event, url, isMainFrame = true) => {
    if (!isMainFrame || config.paired) return;
    const token = tokenFromBoardUrl(url, API_BASE);
    if (!token) return;
    saveConfig({ tvToken: token, paired: true });
    console.log("[TV Box] Pairing saved.");
    startPolling();
  };
  mainWindow.webContents.on("did-navigate", rememberPairing);
  mainWindow.webContents.on("did-navigate-in-page", rememberPairing);
  mainWindow.webContents.on("did-navigate", (_event, _url, responseCode) => {
    if (responseCode >= 500) recovery.schedule(15000);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) { boardStatus = "failed"; recovery.schedule(15000); }
  });
  mainWindow.webContents.on("render-process-gone", () => { boardStatus = "failed"; recovery.schedule(5000); });

  // Start in pairing mode or regular TV board
  if (!config.paired || !config.tvToken) {
    mainWindow.loadURL(`${API_BASE}/tv/pair`).catch(() => {});
  } else {
    switchMode("regular");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Mode Switching ─────────────────────────────────────────────────────────
function switchMode(mode, options = {}) {
  if (updateCandidate && !updateCandidate.active && mode !== "regular") return;
  recovery.cancel();
  currentMode = mode;
  boardStatus = "connecting";
  console.log(`[TV Box] Switching display mode`);

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

  if (!config.paired || !config.tvToken) {
    mainWindow.loadURL(`${API_BASE}/tv/pair`).catch(() => {});
    return;
  }
  switch (mode) {
    case "regular":
      // Load the standard TV board URL
      const tvUrl = `${API_BASE}/tv/${config.tvToken}`;
      mainWindow.loadURL(tvUrl).catch(() => {});
      break;

    case "stream":
      // Load the TV board in stream mode (existing functionality)
      const streamTvUrl = `${API_BASE}/tv/${config.tvToken}`;
      mainWindow.loadURL(streamTvUrl).catch(() => {});
      break;

    case "gameday":
      // Game Day Mode: Full-screen stream + sponsor overlay at bottom
      startGameDayMode(options);
      break;

    case "live-game":
      // The tokenized TV Board owns Live Games presentation. It replaces the
      // local Game Day BrowserView only while a venue game is actually active.
      mainWindow.loadURL(`${API_BASE}/tv/${config.tvToken}`).catch(() => {});
      break;

    case "streaming-login":
      // Open a streaming service for the venue to log in
      const serviceUrl = options.url || "https://tv.youtube.com";
      navigate(mainWindow.webContents, serviceUrl);
      break;

    default:
      mainWindow.loadURL(`${API_BASE}/tv/${config.tvToken}`).catch(() => {});
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
  guardNavigation(streamView.webContents);
  streamView.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) recovery.schedule(15000);
  });
  streamView.webContents.on("render-process-gone", () => recovery.schedule(5000));
  streamView.webContents.on("did-navigate", (_event, _url, responseCode) => {
    if (responseCode >= 500) recovery.schedule(15000);
  });
  streamView.setBounds({ x: 0, y: 0, width, height: streamHeight });
  streamView.setAutoResize({ width: true, height: false });

  // Load the stream URL or YouTube TV
  const streamUrl = options.streamUrl || "https://tv.youtube.com";
  navigate(streamView.webContents, streamUrl);

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
      sponsorData = normalizeSponsorPayload(data.sponsor);
      // Send to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("sponsor-update", sponsorData);
      }
    }
  } catch (e) {
    console.error("[TV Box] Sponsor feed unavailable.");
  }
}

// Refresh sponsor data every 5 minutes
setInterval(fetchSponsorData, 5 * 60 * 1000);

// ─── HTTP Polling (Dashboard Control) ────────────────────────────────────────
let pollInterval = null;
function startPolling() {
  if (updateCandidate && !updateCandidate.active) return;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
  if (!config.paired || !config.tvToken) return;
  console.log("[TV Box] Starting HTTP polling for commands...");
  pollForCommands();
  pollInterval = setInterval(pollForCommands, 5000);
}

async function pollForCommands() {
  void remoteStatus.tick();
  presentation.tick();
  enrollment.tick();
  if (!config.paired || !config.tvToken || (pollController && !pollController.signal.aborted)) return;
  const controller = new AbortController();
  pollController = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `${API_BASE}/api/tv-box-command?token=${encodeURIComponent(config.tvToken)}&version=${encodeURIComponent(APP_VERSION)}`,
      { signal: controller.signal, headers: presentationKey ? { "X-TV-Presentation-Key": presentationKey } : {} }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (controller.signal.aborted) return;

    enrollment.reconcile(data.enrollment);
    if (data.experience) {
      if (JSON.stringify(config.experience) !== JSON.stringify(data.experience)) saveConfig({ experience: data.experience });
      const presenting = presentation.reconcile(data.experience);
      if (presenting) {
        for (const window of providerWindows) if (!window.isDestroyed()) window.close();
        // Dispose streaming playback before the dedicated receiver takes over.
        if (currentMode !== "regular") switchMode("regular");
      }
      fetch(`${API_BASE}/api/tv-presentation`, { method: "POST",
        headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ token: config.tvToken, device_key: presentationKey, action: "report", revision: data.experience.revision,
          ...presentation.report, ...(!presenting ? { receiver_status: boardStatus } : {}) }),
      }).catch(() => {});
      // Only active casting owns the surface. Enrolling a receiver must not
      // disable the venue's existing streaming, Game Day or remote controls.
      if (presenting) return;
      // A presentation/board request overrides older venue settings on this
      // device only. A newer venue command/settings change releases ownership.
      const requested = Date.parse(data.experience.requested_at || '');
      let pending = data.pending_command;
      try { if (typeof pending === 'string') pending = JSON.parse(pending); } catch { pending = null; }
      const freshCommand = pending && Number(pending.ts) > requested;
      if (Number.isFinite(requested) && !freshCommand) data.pending_command = null;
      const freshSettings = Date.parse(data.updated_at || '') > requested;
      if ((freshCommand || freshSettings) && config.releasedPresentationRevision !== data.experience.revision) {
        saveConfig({ releasedPresentationRevision: data.experience.revision });
      }
      if (Number.isFinite(requested) && config.releasedPresentationRevision !== data.experience.revision) {
        data.mode = 'regular'; data.pending_command = null;
      }
    } else if (presentation.active) {
      presentation.stop(); saveConfig({ experience: null }); switchMode("regular");
    }

    // Handle pending command from venue app (e.g., navigate to Hulu)
    if (data.pending_command) {
      let cmd;
      try {
        cmd = typeof data.pending_command === "string"
          ? JSON.parse(data.pending_command)
          : data.pending_command;
      } catch { cmd = null; }

      if (cmd && cmd.type) {
        console.log("[TV Box] Received control command");
        handleCommand(cmd);
        // Acknowledge command (clear it from DB)
        fetch(`${API_BASE}/api/tv-box-command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: config.tvToken, action: "ack_command" }),
        }).catch(() => {});
      }
    }

    // A Live Game takes priority over every configured mode. Game Day has a
    // local BrowserView, so it cannot show the dashboard overlay until the
    // Electron client temporarily returns to the tokenized TV Board.
    configuredMode = data.mode || "regular";
    const liveGameActive = await hasActiveLiveGame(controller.signal);
    if (controller.signal.aborted) return;
    if (liveGameActive && currentMode !== "live-game") {
      switchMode("live-game");
    } else if (!liveGameActive && currentMode === "live-game") {
      const options = {};
      if (data.stream_url) options.streamUrl = data.stream_url;
      if (data.sponsor_name) options.sponsorName = data.sponsor_name;
      if (data.sponsor_logo) options.sponsorLogo = data.sponsor_logo;
      if (data.overlay_text) options.overlayText = data.overlay_text;
      switchMode(configuredMode, options);
    }

    // Honor mode changes only when no Live Game is deliberately holding the
    // TV surface; otherwise the latest configured mode is restored afterward.
    if (!liveGameActive && data.mode && data.mode !== currentMode) {
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
      checkForUpdate(data.latest_version, data.update_url, data.update_sha256);
    }
  } catch (e) {
    console.error("[TV Box] Command poll unavailable; will retry.");
  } finally {
    clearTimeout(timeout);
    if (pollController === controller) pollController = null;
  }
}

async function hasActiveLiveGame(signal) {
  if (!config.tvToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/tv-game?token=${encodeURIComponent(config.tvToken)}`, { signal });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok && data?.active?.display);
  } catch (e) {
    // A temporary game-feed error must not change the venue's configured mode
    // or create a navigation loop on an unattended TV Box.
    console.error("[TV Box] Live Game feed unavailable.");
    return false;
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

async function checkForUpdate(latestVersion, downloadUrl, sha256) {
  if (isUpdating || Date.now() < retryUpdateAfter) return;
  if (compareVersions(APP_VERSION, latestVersion) <= 0) return;
  if (!/^[a-f0-9]{64}$/i.test(sha256 || "") || blockedVersion(INSTALL_DIR, latestVersion)) return;
  isUpdating = true;
  try {
    const previousExe = Number(APP_VERSION.split(".")[0]) < 2 && process.env.PORTABLE_EXECUTABLE_FILE
      ? process.env.PORTABLE_EXECUTABLE_FILE : process.execPath;
    const startupPath = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "myREWRD-TV-Box.bat");
    await prepareUpdate({ version: latestVersion, url: downloadUrl, sha256, installRoot: INSTALL_DIR,
      profile: app.getPath("userData"), startupPath, previousExe });
    handoffRequested = true;
    app.quit();
  } catch {
    console.error("[TV Box] Update could not start safely; keeping the current board.");
    retryUpdateAfter = Date.now() + 5 * 60 * 1000;
    isUpdating = false;
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
        navigate(streamView.webContents, msg.url);
      }
      break;

    case "open_service":
      // Open a streaming service for login
      switchMode("streaming-login", { url: msg.url });
      break;

    case "navigate":
      // Navigate the stream view to a specific URL
      if (streamView && streamView.webContents) {
        navigate(streamView.webContents, msg.url);
      } else {
        // If no stream view exists, load URL in main window
        navigate(mainWindow.webContents, msg.url);
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
      remoteStatus.stop();
      enrollment.stop();
      presentation.stop();
      if (pollController) pollController.abort();
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = null;
      saveConfig({ tvToken: null, venueId: null, venueName: null, paired: false, experience: null });
      switchMode("regular");
      break;

    case "ping":
      // No-op for HTTP polling
      break;

    default:
      console.log("[TV Box] Unknown command:", msg.type);
  }
}

// ─── IPC Handlers (from renderer pages) ─────────────────────────────────────
// A streaming provider must never be able to read the device token via preload.
function trustedRenderer(event) {
  return event.sender === mainWindow?.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame
    && (event.senderFrame.url === `${API_BASE}/tv/pair`
      || (Boolean(config.tvToken) && tokenFromBoardUrl(event.senderFrame.url, API_BASE) === config.tvToken));
}
ipcMain.handle("get-config", () => ({ paired: config.paired, venueName: config.venueName }));
ipcMain.handle("get-mode", () => currentMode);
ipcMain.handle("get-sponsor", () => sponsorData);

ipcMain.on("pair-with-token", (event, token) => {
  if (!trustedRenderer(event) || config.paired || !/^tv_[a-f0-9]+$/.test(token)) return;
  saveConfig({ tvToken: token, paired: true });
  startPolling();
  switchMode("regular");
});

ipcMain.on("switch-mode", (event, mode, options) => {
  if (!trustedRenderer(event)) return;
  switchMode(mode, options);
});

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  presentationKey = safeStorage ? loadPresentationKey({ safeStorage, profile: app.getPath("userData"), installDir: INSTALL_DIR }) : null;
  createMainWindow();
  if (config.paired && config.tvToken && presentationKey && !updateCandidate) presentation.reconcile(config.experience);
  powerMonitor.on("resume", () => recovery.schedule());
  powerMonitor.on("unlock-screen", () => recovery.schedule());
  powerMonitor.on("suspend", () => {
    remoteStatus.stop();
    recovery.cancel();
    if (pollController) pollController.abort();
  });

  if (config.paired && config.tvToken) {
    startPolling();
    fetchSponsorData();
  }
});

app.on("before-quit", () => {
  remoteStatus.stop();
  enrollment.stop();
  presentation.stop();
  recovery.stop();
  if (pollController) pollController.abort();
  if (pollInterval) clearInterval(pollInterval);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// ─── Auto-restart on crash ──────────────────────────────────────────────────
process.on("uncaughtException", () => {
  console.error("[TV Box] Unexpected application error");
  // Don't crash — just log and continue
});
