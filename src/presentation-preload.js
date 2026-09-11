const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('presentation', {
  signal: answer => ipcRenderer.invoke('presentation-signal', answer),
  status: value => ipcRenderer.send('presentation-status', value),
});
