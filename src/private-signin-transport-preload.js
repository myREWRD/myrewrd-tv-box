const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tvPrivateSignIn',{
  state:()=>ipcRenderer.invoke('tv-signin-state'),
  answer:value=>ipcRenderer.invoke('tv-signin-answer',value),
  frame:()=>ipcRenderer.invoke('tv-signin-frame'),
  input:value=>ipcRenderer.invoke('tv-signin-input',value),
});
