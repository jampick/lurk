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

  // Stable Windows identity for taskbar grouping/pinning (matches NSIS appId)
  app.setAppUserModelId('com.oddjob.lurk');

  // Fullscreen is the one permission pages legitimately use (video players).
  // Everything else — camera, mic, location, notifications — stays denied.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen');
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

/*
 * og:image lookup for link posts Reddit gives no preview for.
 * Fetches only the head of the article page (200 KB cap, 6 s timeout),
 * extracts og:image / twitter:image, and caches the result.
 */
const ogCache = new Map();

ipcMain.handle('article:previewImage', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  if (ogCache.has(url)) return ogCache.get(url);

  let result = null;
  try {
    const res = await net.fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'Accept': 'text/html' }
    });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('text/html') && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let html = '';
      while (html.length < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});

      const tag = html.match(
        /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/i)?.[0]
        || html.match(
        /<meta[^>]+content=["'][^"']+["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)/i)?.[0];
      const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];
      if (content) {
        const abs = new URL(content.replace(/&amp;/g, '&'), url).href;
        if (abs.startsWith('https://')) result = abs;   // CSP allows https images only
      }
    }
  } catch { /* article host slow/unreachable — card just stays imageless */ }

  if (ogCache.size > 500) ogCache.delete(ogCache.keys().next().value);
  ogCache.set(url, result);
  return result;
});
