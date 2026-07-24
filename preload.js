const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lurk', {
  fetchReddit: (apiPath) => ipcRenderer.invoke('reddit:fetch', apiPath),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  platform: process.platform
});
