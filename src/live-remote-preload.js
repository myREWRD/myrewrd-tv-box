const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tvLive',{
  state:()=>ipcRenderer.invoke('tv-live-state'),
  answer:value=>ipcRenderer.invoke('tv-live-answer',value),
  frame:()=>ipcRenderer.invoke('tv-live-frame'),
  input:value=>ipcRenderer.invoke('tv-live-input',value),
});
