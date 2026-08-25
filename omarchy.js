/*
 * Omarchy desktop integration (https://omarchy.org).
 *
 * Omarchy renders every *.tpl in ~/.config/omarchy/themed/ into
 * ~/.local/state/omarchy/current/theme/ each time the system theme changes.
 * Installing omarchy/lurk.css.tpl there gives us a stylesheet that always
 * matches the rest of the desktop; we read it and re-read it on every switch.
 *
 * All of this is best-effort: on a machine without Omarchy every function here
 * no-ops and Lurk keeps its built-in palette and titlebar.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_DIR = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
  'omarchy', 'current'
);
const THEME_CSS = path.join(STATE_DIR, 'theme', 'lurk.css');

/*
 * Tiling Wayland compositors put the window title in their own bar and hand the
 * app no frame to hang controls on, so our CSS titlebar is 40px of duplicated
 * chrome there. Stacking desktops (GNOME, KDE, XFCE) still get it.
 */
function isTilingSession() {
  if (process.platform !== 'linux') return false;
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) return true;
  const desktop = [process.env.XDG_CURRENT_DESKTOP, process.env.XDG_SESSION_DESKTOP]
    .filter(Boolean).join(' ');
  return /hyprland|sway|river|niri|wayfire/i.test(desktop);
}

function readThemeCss() {
  if (process.platform !== 'linux') return null;
  try {
    return fs.readFileSync(THEME_CSS, 'utf8');
  } catch {
    return null;  // no Omarchy, or no lurk.css.tpl installed
  }
}

/*
 * omarchy-theme-set swaps the whole `theme` directory (rm -rf + mv), so a watch
 * on the file itself dies at the first theme change. Watch the stable parent
 * and debounce — the rename fires before the rendered files settle.
 */
function watchTheme(onChange) {
  if (process.platform !== 'linux') return () => {};

  let timer = null;
  let watcher = null;
  try {
    watcher = fs.watch(STATE_DIR, () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChange(readThemeCss()), 150);
    });
  } catch {
    return () => {};  // directory absent: not an Omarchy box
  }

  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

module.exports = { isTilingSession, readThemeCss, watchTheme };
