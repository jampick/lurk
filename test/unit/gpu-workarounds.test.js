'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { needsVideoDecodeWorkaround } = require('../../lib/gpu-workarounds.js');

const nvidia = () => true;
const noNvidia = () => false;
const wayland = { XDG_SESSION_TYPE: 'wayland' };

test('a Wayland session with the NVIDIA driver loaded gets the workaround', () => {
  assert.equal(
    needsVideoDecodeWorkaround({ platform: 'linux', env: wayland, hasNvidia: nvidia }),
    true);
  // WAYLAND_DISPLAY on its own is enough — XDG_SESSION_TYPE is not always set
  assert.equal(
    needsVideoDecodeWorkaround({
      platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-1' }, hasNvidia: nvidia
    }),
    true);
});

test('machines where hardware decode works keep it', () => {
  // Intel/AMD-only under Wayland: the import path that fails is never taken
  assert.equal(
    needsVideoDecodeWorkaround({ platform: 'linux', env: wayland, hasNvidia: noNvidia }),
    false);
  // NVIDIA under X11 imports through a different path
  assert.equal(
    needsVideoDecodeWorkaround({
      platform: 'linux', env: { XDG_SESSION_TYPE: 'x11' }, hasNvidia: nvidia
    }),
    false);
  // and the probe must not be consulted at all off Linux
  for (const platform of ['win32', 'darwin']) {
    assert.equal(
      needsVideoDecodeWorkaround({ platform, env: wayland, hasNvidia: nvidia }),
      false);
  }
});

test('LURK_VIDEO_ACCEL overrides the probe in both directions', () => {
  // forced off on a machine the probe would have cleared
  assert.equal(
    needsVideoDecodeWorkaround({
      platform: 'linux', env: { ...wayland, LURK_VIDEO_ACCEL: '0' }, hasNvidia: noNvidia
    }),
    true);
  // forced on for the affected machine, which is how the bug gets A/B'd
  assert.equal(
    needsVideoDecodeWorkaround({
      platform: 'linux', env: { ...wayland, LURK_VIDEO_ACCEL: '1' }, hasNvidia: nvidia
    }),
    false);
  // an explicit choice applies off Linux too
  assert.equal(
    needsVideoDecodeWorkaround({
      platform: 'win32', env: { LURK_VIDEO_ACCEL: '0' }, hasNvidia: noNvidia
    }),
    true);
});

test('an unrecognised LURK_VIDEO_ACCEL value falls through to the probe', () => {
  assert.equal(
    needsVideoDecodeWorkaround({
      platform: 'linux', env: { ...wayland, LURK_VIDEO_ACCEL: 'yes' }, hasNvidia: nvidia
    }),
    true);
});

test('a bare call does not throw', () => {
  assert.equal(typeof needsVideoDecodeWorkaround({ platform: 'win32' }), 'boolean');
});
