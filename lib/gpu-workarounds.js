'use strict';

/*
 * Linux desktops where Chromium cannot hand a decoded video frame to the
 * compositor.
 *
 * On a hybrid NVIDIA + integrated box under Wayland the GPU process allocates
 * its buffers against one render node while the session runs on the other, and
 * importing a decoded frame fails:
 *
 *   eglCreateImage failed with 0x00003009        (EGL_BAD_MATCH)
 *   Unable to initialize binding from pixmap
 *   OzoneImageBacking::ProduceSkiaGanesh failed to create GL representation
 *   SharedImageManager::ProduceSkia: incompatible backing: CompoundImageBacking
 *
 * Once those start failing the window stops receiving fresh tiles, so stale
 * pixels stay on screen: the feed looks frozen, images render malformed, and
 * the comments panel appears to flicker in and out. It reads as a hang, but
 * the DOM is fine — only presentation is broken (issue #39).
 *
 * Turning off hardware video decode avoids that import path entirely. Measured
 * on the reporting machine over 40s sessions playing the same videos: 383
 * import failures before, 0 after.
 *
 * Deliberately scoped no wider than the evidence supports — a Wayland session
 * with the NVIDIA driver loaded — so machines where hardware decode works keep
 * it. LURK_VIDEO_ACCEL overrides the probe in either direction, which is also
 * how you A/B the bug without a rebuild.
 */

const fs = require('node:fs');

// The NVIDIA kernel module exposes this; it is absent on Intel/AMD-only boxes.
const NVIDIA_PROC = '/proc/driver/nvidia';

function defaultHasNvidia() {
  try {
    return fs.existsSync(NVIDIA_PROC);
  } catch {
    return false;                  // an unreadable /proc is not an NVIDIA box
  }
}

function isWayland(env) {
  return env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY);
}

/**
 * Should we start Chromium with hardware video decode turned off?
 *
 * @param {object}   o
 * @param {string}   o.platform            process.platform
 * @param {object}   [o.env]               process.env
 * @param {Function} [o.hasNvidia]         driver probe, injected by the tests
 * @returns {boolean}
 */
function needsVideoDecodeWorkaround({ platform, env = {}, hasNvidia = defaultHasNvidia } = {}) {
  // An explicit choice wins everywhere, including on Windows and macOS.
  if (env.LURK_VIDEO_ACCEL === '0') return true;    // forced off  -> apply it
  if (env.LURK_VIDEO_ACCEL === '1') return false;   // forced on   -> leave it

  if (platform !== 'linux') return false;
  if (!isWayland(env)) return false;                // X11 imports through a different path
  return hasNvidia();
}

module.exports = { needsVideoDecodeWorkaround, defaultHasNvidia, NVIDIA_PROC };
