const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('lurk', {
  fetchReddit: (apiPath) => ipcRenderer.invoke('reddit:fetch', apiPath),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  articlePreviewImage: (url) => ipcRenderer.invoke('article:previewImage', url),
  setBadge: (dataUrl, count) => ipcRenderer.invoke('app:badge', dataUrl, count),
  zoomBy: (dir) => {
    const z = Math.max(-3, Math.min(6, webFrame.getZoomLevel() + dir));
    webFrame.setZoomLevel(z);
    return z;
  },
  setZoom: (z) => webFrame.setZoomLevel(Math.max(-3, Math.min(6, z))),
  platform: process.platform
});
