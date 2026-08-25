'use strict';

/*
 * Which update strategy the running install is actually capable of.
 *
 *   auto     electron-updater can download and swap the app in place.
 *   notify   we can detect a new version but not install it — tell the user
 *            and send them to the release page.
 *   disabled unpackaged dev run; checking would only ever be noise.
 *
 * The Linux split is the important one: electron-updater can self-update an
 * AppImage (it rewrites the file the APPIMAGE env var points at) but has no
 * way to drive apt or pacman, so .deb and .pacman installs are notify-only.
 */

const REPO = 'jampick/lurk';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * @param {object}  o
 * @param {string}  o.platform    process.platform
 * @param {boolean} o.isPackaged  app.isPackaged
 * @param {object}  [o.env]       process.env
 * @returns {'auto'|'notify'|'disabled'}
 */
function updateMode({ platform, isPackaged, env = {} }) {
  if (!isPackaged) return 'disabled';
  if (platform === 'win32') return 'auto';
  if (platform === 'linux') return env.APPIMAGE ? 'auto' : 'notify';
  // macOS: Squirrel.Mac refuses to apply an update to an unsigned bundle, so
  // until we ship a Developer ID build this can only ever be a notification.
  // Tracked in #23.
  if (platform === 'darwin') return 'notify';
  return 'notify';
}

module.exports = { updateMode, REPO, RELEASES_URL, LATEST_API };
