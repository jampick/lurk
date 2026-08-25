'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE = require.resolve('../../omarchy.js');

/*
 * omarchy.js resolves its state directory at require time from XDG_STATE_HOME,
 * and every function branches on process.platform. Both have to be set up
 * before the module is loaded, so each case loads its own fresh copy.
 */
function loadWith({ platform, env = {} }) {
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const savedEnv = { ...process.env };

  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  for (const key of ['XDG_STATE_HOME', 'HYPRLAND_INSTANCE_SIGNATURE',
    'XDG_CURRENT_DESKTOP', 'XDG_SESSION_DESKTOP']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  delete require.cache[MODULE];
  const mod = require(MODULE);

  const restore = () => {
    Object.defineProperty(process, 'platform', savedPlatform);
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    delete require.cache[MODULE];
  };
  return { mod, restore };
}

function withOmarchy(opts, fn) {
  const { mod, restore } = loadWith(opts);
  try { return fn(mod); } finally { restore(); }
}

test('isTilingSession is false off Linux, whatever the env says', () => {
  for (const platform of ['win32', 'darwin']) {
    withOmarchy({ platform, env: { HYPRLAND_INSTANCE_SIGNATURE: 'abc' } }, (m) => {
      assert.equal(m.isTilingSession(), false);
    });
  }
});

test('isTilingSession detects Hyprland by its instance signature', () => {
  withOmarchy({ platform: 'linux', env: { HYPRLAND_INSTANCE_SIGNATURE: 'abc123' } }, (m) => {
    assert.equal(m.isTilingSession(), true);
  });
});

test('isTilingSession detects tiling compositors by desktop name', () => {
  for (const desktop of ['Hyprland', 'sway', 'river', 'niri', 'wayfire', 'SWAY']) {
    withOmarchy({ platform: 'linux', env: { XDG_CURRENT_DESKTOP: desktop } }, (m) => {
      assert.equal(m.isTilingSession(), true, `expected tiling for ${desktop}`);
    });
  }
  withOmarchy({ platform: 'linux', env: { XDG_SESSION_DESKTOP: 'hyprland' } }, (m) => {
    assert.equal(m.isTilingSession(), true);
  });
});

test('isTilingSession leaves stacking desktops their titlebar', () => {
  for (const desktop of ['GNOME', 'KDE', 'XFCE', 'ubuntu:GNOME', '']) {
    withOmarchy({ platform: 'linux', env: { XDG_CURRENT_DESKTOP: desktop } }, (m) => {
      assert.equal(m.isTilingSession(), false, `expected no tiling for "${desktop}"`);
    });
  }
});

test('readThemeCss returns null off Linux', () => {
  withOmarchy({ platform: 'win32' }, (m) => assert.equal(m.readThemeCss(), null));
  withOmarchy({ platform: 'darwin' }, (m) => assert.equal(m.readThemeCss(), null));
});

test('readThemeCss returns null when Omarchy is not installed', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lurk-omarchy-'));
  withOmarchy({ platform: 'linux', env: { XDG_STATE_HOME: empty } }, (m) => {
    assert.equal(m.readThemeCss(), null);
  });
  fs.rmSync(empty, { recursive: true, force: true });
});

test('readThemeCss reads the rendered theme when it exists', () => {
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lurk-omarchy-'));
  const themeDir = path.join(stateHome, 'omarchy', 'current', 'theme');
  fs.mkdirSync(themeDir, { recursive: true });
  const css = ':root { --bg: #101010 !important; }';
  fs.writeFileSync(path.join(themeDir, 'lurk.css'), css, 'utf8');

  withOmarchy({ platform: 'linux', env: { XDG_STATE_HOME: stateHome } }, (m) => {
    assert.equal(m.readThemeCss(), css);
  });
  fs.rmSync(stateHome, { recursive: true, force: true });
});

test('watchTheme is a no-op returning an unsubscribe function off Linux', () => {
  withOmarchy({ platform: 'win32' }, (m) => {
    const stop = m.watchTheme(() => assert.fail('must not fire off Linux'));
    assert.equal(typeof stop, 'function');
    stop();   // must not throw
  });
});

test('watchTheme returns a safe unsubscribe when the state dir is absent', () => {
  const missing = path.join(os.tmpdir(), 'lurk-omarchy-does-not-exist-12345');
  withOmarchy({ platform: 'linux', env: { XDG_STATE_HOME: missing } }, (m) => {
    const stop = m.watchTheme(() => assert.fail('must not fire without a state dir'));
    assert.equal(typeof stop, 'function');
    stop();
  });
});

test('the shipped theme template covers every palette variable the app uses', () => {
  // If styles.css grows a --var that lurk.css.tpl does not override, Omarchy
  // themes silently keep Lurk's built-in colour for it.
  const tpl = fs.readFileSync(path.join(__dirname, '../../omarchy/lurk.css.tpl'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../../renderer/styles.css'), 'utf8');

  const declared = [...styles.matchAll(/^\s*(--[a-z-]+):/gm)].map(m => m[1]);
  const rootBlock = styles.slice(styles.indexOf(':root'), styles.indexOf('}'));
  const palette = declared.filter(v => rootBlock.includes(v + ':'))
    // --radius and --titlebar-h are geometry, not colour; Omarchy has no say.
    .filter(v => !['--radius', '--titlebar-h'].includes(v));

  const missing = palette.filter(v => !tpl.includes(v));
  assert.deepEqual(missing, [], `lurk.css.tpl is missing: ${missing.join(', ')}`);
});
