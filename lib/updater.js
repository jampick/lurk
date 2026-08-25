'use strict';

/*
 * Update checking, wired to GitHub Releases.
 *
 * Two paths, picked by lib/update-mode:
 *
 *   auto    electron-updater downloads the new build in the background and we
 *           offer a restart. Windows (NSIS) and Linux (AppImage).
 *   notify  we ask the GitHub API what the latest tag is and, if it beats our
 *           own version, surface a banner plus a desktop notification linking
 *           to the release page. macOS and .deb/.pacman Linux installs.
 *
 * Every state change is pushed to the renderer on 'update:state' and mirrored
 * as an OS notification, so a tiling-WM user with no titlebar still gets told.
 */

const { Notification, net, shell } = require('electron');
const { updateMode, RELEASES_URL, LATEST_API } = require('./update-mode');
const { isNewer } = require('./semver');

// Re-check this often while the app stays open; long-running windows are the
// normal case for a feed reader, so a startup-only check would rarely fire.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;   // 6 hours
const STARTUP_DELAY_MS = 8 * 1000;              // let the feed load first

function createUpdater({ app, broadcast, logger = console }) {
  const mode = updateMode({
    platform: process.platform,
    isPackaged: app.isPackaged,
    env: process.env
  });

  let state = {
    mode,
    status: mode === 'disabled' ? 'disabled' : 'idle',
    current: app.getVersion(),   // what we are running, for the sidebar footer
    version: null                // what is available, once we know
  };
  let timer = null;

  function setState(next) {
    state = { ...state, ...next };
    broadcast('update:state', state);
  }

  function notifyDesktop(title, body) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => {
      if (state.status === 'downloaded') return;   // renderer banner handles restart
      shell.openExternal(RELEASES_URL);
    });
    n.show();
  }

  /* ---- notify-only path: ask the GitHub API directly ---- */
  async function checkViaApi() {
    const res = await net.fetch(LATEST_API, {
      headers: { 'Accept': 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const body = await res.json();
    const latest = String(body.tag_name || '').replace(/^v/, '');
    if (!isNewer(latest, app.getVersion())) {
      setState({ status: 'current', version: null });
      return;
    }
    setState({ status: 'available-manual', version: latest, url: body.html_url || RELEASES_URL });
    notifyDesktop(`Lurk ${latest} is available`, 'Click to open the download page.');
  }

  /* ---- auto path: hand off to electron-updater ---- */
  let autoUpdater = null;

  function loadAutoUpdater() {
    if (autoUpdater) return autoUpdater;
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = logger;

    autoUpdater.on('update-available', (info) => {
      setState({ status: 'downloading', version: info.version });
      notifyDesktop(`Lurk ${info.version} is downloading`, 'You will be prompted to restart when it is ready.');
    });
    autoUpdater.on('update-not-available', () => setState({ status: 'current', version: null }));
    autoUpdater.on('download-progress', (p) => {
      setState({ status: 'downloading', percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      setState({ status: 'downloaded', version: info.version, percent: 100 });
      notifyDesktop(`Lurk ${info.version} is ready`, 'Restart Lurk to finish updating.');
    });
    autoUpdater.on('error', (err) => {
      logger.warn?.('[updater]', err?.message || err);
      setState({ status: 'error', error: String(err?.message || err) });
    });
    return autoUpdater;
  }

  async function check({ manual = false } = {}) {
    if (mode === 'disabled') {
      if (manual) setState({ status: 'disabled' });
      return state;
    }
    // Don't restart a download that already finished or is in flight.
    if (state.status === 'downloaded' || state.status === 'downloading') return state;

    setState({ status: 'checking' });
    try {
      if (mode === 'auto') await loadAutoUpdater().checkForUpdates();
      else await checkViaApi();
    } catch (err) {
      logger.warn?.('[updater] check failed:', err?.message || err);
      setState({ status: 'error', error: String(err?.message || err) });
    }
    return state;
  }

  function start() {
    if (mode === 'disabled') return;
    setTimeout(() => check(), STARTUP_DELAY_MS).unref?.();
    timer = setInterval(() => check(), CHECK_INTERVAL_MS);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function install() {
    if (state.status !== 'downloaded' || !autoUpdater) {
      shell.openExternal(state.url || RELEASES_URL);
      return;
    }
    // isSilent=false so Windows shows the installer UI; isForceRunAfter=true so
    // the app comes back up rather than leaving the user staring at a desktop.
    autoUpdater.quitAndInstall(false, true);
  }

  function openReleasePage() {
    shell.openExternal(state.url || RELEASES_URL);
  }

  return { start, stop, check, install, openReleasePage, getState: () => state, mode };
}

module.exports = { createUpdater, CHECK_INTERVAL_MS };
