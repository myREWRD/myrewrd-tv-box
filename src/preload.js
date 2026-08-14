// Preload script — exposes safe IPC to renderer pages
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tvBox", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  getMode: () => ipcRenderer.invoke("get-mode"),
  getSponsor: () => ipcRenderer.invoke("get-sponsor"),
  pairWithToken: (token) => ipcRenderer.send("pair-with-token", token),
  switchMode: (mode, options) => ipcRenderer.send("switch-mode", mode, options),
  onSponsorUpdate: (callback) => ipcRenderer.on("sponsor-update", (_, data) => callback(data)),
  onModeChange: (callback) => ipcRenderer.on("mode-change", (_, mode) => callback(mode)),
});
