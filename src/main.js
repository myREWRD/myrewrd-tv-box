// myREWRD TV Box — Main Electron Process
// Manages: pairing, mode switching, HTTP polling control, DRM streaming, sponsor overlay, auto-update

const { app, BrowserWindow, BrowserView, ipcMain, screen, powerMonitor, safeStorage, components } = require("electron");
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
const { createProviderRemote, applyRemoteCommand } = require("./provider-remote");
const { createLiveRemote } = require("./live-remote");
const { gameDayUrl } = require("./game-day-url");
const { createGameDayProvider, HOMES } = require("./game-day-provider");
const { createProtectedPlayback } = require("./protected-playback");
const protectedPlayback = createProtectedPlayback({ components });

// Recovery may race a completed restart if its result could not be written.
// Only one process may own this device profile and visible board.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => { if (mainWindow) restoreBoard(); });

function navigate(contents, url) {
  if (!allowedNavigation(url, API_BASE, config.tvToken)) return;
  const options = /^https:\/\/www\.youtube\.com\/embed\//.test(url) ? {httpReferrer:API_BASE} : {};
  contents.loadURL(url, options).catch(() => {});
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
let streamPairingToken = null;
let streamRequest = 0;
let streamRetry = null;
let streamTarget = null;
let overlayWindow = null; // Transparent overlay for sponsor bar
let config = loadConfig();
const gameDayProvider = createGameDayProvider({getConfig:()=>config,save:saveConfig});
let currentMode = "regular"; // 'regular' | 'stream' | 'gameday' | 'live-game'
let boardStatus = "connecting";
let configuredMode = "regular";
let sponsorData = null;
let isUpdating = false; // Prevent multiple simultaneous updates
let retryUpdateAfter = 0;
let handoffRequested = false;
let restartTimer = null;
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
const providerRemote = createProviderRemote({ apiBase: API_BASE, getToken: () => config.tvToken, getKey: () => presentationKey,
  canPoll: () => Boolean(config.paired && !handoffRequested && (!updateCandidate || updateCandidate.active)),
  apply: command => command?.type==='restart_app' ? requestRemoteRestart() : applyRemoteCommand(command, {
    getView: () => streamView,
    canControl: () => currentMode === 'gameday' && !presentation.active && !providerWindows.size && !isUpdating,
    openProvider: (url, provider) => openGameDayProvider(provider), focus: () => mainWindow?.focus(),
  }),
});

function requestRemoteRestart() {
  if(!config.paired || handoffRequested || isUpdating || restartTimer || presentation.active || (updateCandidate && !updateCandidate.active))return 'unavailable';
  // Leave time for the claimed command receipt. Never replay an updater job flag.
  const restartToken=config.tvToken, restartKey=presentationKey;
  restartTimer=setTimeout(()=>{
    if(!config.paired || config.tvToken!==restartToken || presentationKey!==restartKey || isUpdating || handoffRequested || presentation.active || (updateCandidate && !updateCandidate.active)){restartTimer=null;return;}
    app.relaunch({args:[]});
    handoffRequested=true;
    app.quit();
  },2000);
  return 'applied';
}

const liveRemote = createLiveRemote({ BrowserWindow, ipcMain, apiBase:API_BASE,
  diagnose:record=>fs.writeFileSync(path.join(app.getPath('userData'),'live-remote-status.json'),JSON.stringify(record)),
  getToken:()=>config.tvToken, getKey:()=>presentationKey, getView:()=>streamView,
  canControl:()=>Boolean(config.paired && !handoffRequested && (!updateCandidate || updateCandidate.active) && currentMode==='gameday' && !presentation.active && !providerWindows.size && !isUpdating),
  apply:(command, liveCurrent)=>applyRemoteCommand(command,{getView:()=>streamView,
    canControl:()=>liveCurrent() && currentMode==='gameday' && !presentation.active && !providerWindows.size && !isUpdating,
    openProvider:(url,provider)=>openGameDayProvider(provider),focus:()=>mainWindow?.focus()})
});

function restoreBoard() {
  liveRemote.stop();
  providerRemote.stop();
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
  if ((Object.hasOwn(data,'tvToken') && data.tvToken!==config.tvToken) || data.paired===false) {
    gameDayProvider.reset();
    data={...data,gameDayProvider:null};
  }
  config = { ...config, ...data };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Protected playback requires the ECS runtime, component readiness and a
// production VMP signature. Chromium feature flags do not install Widevine.

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
  liveRemote.stop();
  if (updateCandidate && !updateCandidate.active && mode !== "regular") return;
  recovery.cancel();
  currentMode = mode;
  boardStatus = "connecting";
  console.log(`[TV Box] Switching display mode`);

  // Remove any existing stream view
  if(streamView && config.paired && streamPairingToken===config.tvToken && !streamView.webContents.isDestroyed()) gameDayProvider.capture(streamView.webContents.getURL());
  streamRequest++;
  clearTimeout(streamRetry);
  streamRetry = null;
  streamTarget = null;
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
      sandbox: true,
      disableHtmlFullscreenWindowResize: true,
    },
  });

  mainWindow.addBrowserView(streamView);
  streamPairingToken=config.tvToken;
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
  const streamUrl = gameDayProvider.target();
  loadGameDayStream(streamUrl);

  // Fetch and display sponsor data
  fetchSponsorData();
  void gameDayTicker.refresh();
}

function openGameDayProvider(provider) {
  if(streamView && streamPairingToken===config.tvToken && !streamView.webContents.isDestroyed()) gameDayProvider.capture(streamView.webContents.getURL());
  const url=gameDayProvider.choose(provider);
  if(!url) return false;
  return loadGameDayStream(url);
}

async function loadGameDayStream(url) {
  url = gameDayUrl(url);
  if (!streamView || !allowedNavigation(url, API_BASE, config.tvToken)) return;
  const view = streamView;
  const request = ++streamRequest;
  streamTarget = url;
  boardStatus = 'connecting';
  clearTimeout(streamRetry);
  streamRetry = null;
  const current = () => streamView === view && streamRequest === request && currentMode === 'gameday';
  view.webContents.loadFile(path.join(__dirname, 'pages', 'playback-status.html')).catch(() => {});
  try {
    await protectedPlayback.ready();
    if (current()) navigate(view.webContents, url);
  } catch {
    if (!current()) return;
    boardStatus = 'failed';
    // Do not log provider URLs, license responses, account data or component errors.
    console.error('[TV Box] Protected video preparation unavailable; retry scheduled.');
    view.webContents.loadFile(path.join(__dirname, 'pages', 'playback-status.html'), { hash: 'retry' }).catch(() => {});
    streamRetry = setTimeout(() => { if (current()) void loadGameDayStream(url); }, 60000);
  }
}

const { createGameDayTicker } = require("./game-day-ticker");
const gameDayTicker = createGameDayTicker({fetch, getToken:()=>config.tvToken, apiBase:API_BASE,
  publish: messages => { if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("ticker-update",messages); }
});
setInterval(()=>{if(currentMode === "gameday") void gameDayTicker.refresh();},60000);

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
  providerRemote.resume();
  console.log("[TV Box] Starting HTTP polling for commands...");
  pollForCommands();
  pollInterval = setInterval(pollForCommands, 5000);
}

async function pollForCommands() {
  void providerRemote.tick();
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
      // Deprecated Game Day URL command. Live Stream is rendered by the board.
      break;

    case "open_service":
      // Open a streaming service for login
      switchMode("streaming-login", { url: msg.url });
      break;

    case "navigate":
      // Navigate the stream view to a specific URL
      if (streamView && streamView.webContents) {
        const provider=Object.keys(HOMES).find(id=>msg.url===HOMES[id] || msg.url===HOMES[id].replace(/\/$/,''));
        if(provider) void openGameDayProvider(provider);
      } else {
        // If no stream view exists, load URL in main window
        navigate(mainWindow.webContents, msg.url);
      }
      break;

    case "refresh":
      if (mainWindow) mainWindow.webContents.reload();
      if (streamView && streamTarget) {
        const currentUrl = streamView.webContents.getURL();
        void loadGameDayStream(allowedNavigation(currentUrl, API_BASE, config.tvToken) ? currentUrl : streamTarget);
      }
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
      liveRemote.stop();
  providerRemote.stop();
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
ipcMain.handle("get-ticker", event => {
  const expected = require("url").pathToFileURL(path.join(__dirname,"pages","gameday-sponsor.html")).href;
  return event.sender === mainWindow?.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === expected ? gameDayTicker.current() : [];
});

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
    liveRemote.stop();
  providerRemote.stop();
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
  liveRemote.stop();
  providerRemote.stop();
  streamRequest++;
  clearTimeout(streamRetry);
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
