const { app, BrowserWindow, ipcMain, net, session, shell, nativeTheme } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0e0f13',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: {
      color: '#0e0f13',
      symbolColor: '#9aa0ae',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open all external links in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

/*
 * Reddit's edge (Fastly) returns 403 for bare JSON requests, but serves them
 * happily once the session carries the cookies a normal page visit sets.
 * So: load reddit.com once in a hidden window to acquire cookies, then fetch
 * JSON through Chromium's network stack with credentials included.
 */
let warmupPromise = null;

function warmCookies() {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      webPreferences: { sandbox: true }
    });
    win.webContents.setAudioMuted(true);
    try {
      await win.loadURL('https://www.reddit.com/');
      await new Promise(r => setTimeout(r, 2500));
    } catch { /* offline or blocked — fetches will surface the error */ }
    win.destroy();
  })();
  return warmupPromise;
}

async function redditFetch(url) {
  return net.fetch(url, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  });
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';

  // No page in this app ever needs camera, mic, location, notifications, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // Reddit's HLS video streams don't send CORS headers, and our renderer runs
  // from file:// — inject permissive headers for media hosts so hls.js can fetch.
  const filter = { urls: ['https://v.redd.it/*', 'https://*.redd.it/*'] };
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'access-control-allow-origin') delete headers[key];
    }
    headers['Access-Control-Allow-Origin'] = ['*'];
    callback({ responseHeaders: headers });
  });

  // YouTube refuses to embed without a Referer (error 153) — our renderer is
  // file:// and sends none, so supply one for YouTube's embed requests.
  const ytFilter = { urls: ['https://www.youtube-nocookie.com/*', 'https://*.youtube.com/*'] };
  session.defaultSession.webRequest.onBeforeSendHeaders(ytFilter, (details, callback) => {
    details.requestHeaders['Referer'] = 'https://www.youtube.com/';
    details.requestHeaders['Origin'] = 'https://www.youtube.com';
    callback({ requestHeaders: details.requestHeaders });
  });

  warmCookies();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('reddit:fetch', async (_event, apiPath) => {
  if (typeof apiPath !== 'string' || !apiPath.startsWith('/')) {
    return { ok: false, error: 'Bad request path' };
  }
  const url = 'https://www.reddit.com' + apiPath;
  try {
    await warmCookies();
    let res = await redditFetch(url);
    if (res.status === 403) {
      // cookies expired or got flagged — re-warm once and retry
      warmupPromise = null;
      await warmCookies();
      res = await redditFetch(url);
    }
    if (!res.ok) {
      return { ok: false, error: `Reddit returned ${res.status}`, status: res.status };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
});

ipcMain.handle('app:openExternal', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});
