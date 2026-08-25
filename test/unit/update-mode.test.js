'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { updateMode, RELEASES_URL, LATEST_API } = require('../../lib/update-mode.js');

test('an unpackaged dev run never checks for updates', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    assert.equal(updateMode({ platform, isPackaged: false, env: {} }), 'disabled');
    // even an AppImage-looking env must not turn dev checking on
    assert.equal(
      updateMode({ platform, isPackaged: false, env: { APPIMAGE: '/tmp/Lurk.AppImage' } }),
      'disabled');
  }
});

test('Windows NSIS installs update themselves', () => {
  assert.equal(updateMode({ platform: 'win32', isPackaged: true, env: {} }), 'auto');
});

test('Linux self-updates only from an AppImage', () => {
  assert.equal(
    updateMode({ platform: 'linux', isPackaged: true, env: { APPIMAGE: '/opt/Lurk.AppImage' } }),
    'auto');
  // .deb and pacman installs are owned by the system package manager
  assert.equal(updateMode({ platform: 'linux', isPackaged: true, env: {} }), 'notify');
});

test('macOS is notify-only until the app is signed', () => {
  assert.equal(updateMode({ platform: 'darwin', isPackaged: true, env: {} }), 'notify');
});

test('an unknown platform degrades to notify rather than auto', () => {
  assert.equal(updateMode({ platform: 'freebsd', isPackaged: true, env: {} }), 'notify');
});

test('release URLs point at this repository', () => {
  assert.equal(RELEASES_URL, 'https://github.com/jampick/lurk/releases/latest');
  assert.equal(LATEST_API, 'https://api.github.com/repos/jampick/lurk/releases/latest');
});
