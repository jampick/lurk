const { contextBridge, ipcRenderer, webFrame } = require('electron');

/*
 * Desktop integration, applied here rather than in the renderer so it lands
 * before the first style pass. webFrame.insertCSS is not subject to the page
 * CSP, so no relaxing of index.html's policy is needed.
 */
const NO_TITLEBAR_CSS = `
  :root { --titlebar-h: 0px !important; }
  #titlebar { display: none !important; }
`;

let themeKey = null;

function applyTheme(css) {
  if (themeKey) {
    webFrame.removeInsertedCSS(themeKey);
    themeKey = null;
  }
  if (css) themeKey = webFrame.insertCSS(css);
}

const desktop = ipcRenderer.sendSync('omarchy:init');
if (desktop.hideTitlebar) webFrame.insertCSS(NO_TITLEBAR_CSS);
applyTheme(desktop.css);

ipcRenderer.on('omarchy:theme', (_event, css) => applyTheme(css));

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
