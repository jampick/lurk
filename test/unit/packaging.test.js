'use strict';

/*
 * Guards on the things that only break at release time, when the feedback loop
 * is a failed GitHub Actions run rather than a failed test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const { parse } = require('../../lib/semver.js');

test('the package version is valid SemVer', () => {
  assert.notEqual(parse(pkg.version), null, `bad version: ${pkg.version}`);
  assert.ok(!pkg.version.startsWith('v'), 'package.json version must not be v-prefixed');
});

test('the current version has a CHANGELOG entry', () => {
  assert.ok(changelog.includes(`## [${pkg.version}]`),
    `CHANGELOG.md has no "## [${pkg.version}]" section`);
});

test('the CHANGELOG keeps an Unreleased section for in-flight work', () => {
  assert.ok(changelog.includes('## [Unreleased]'));
});

test('every CHANGELOG version heading is valid SemVer', () => {
  const versions = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)]
    .map(m => m[1])
    .filter(v => v !== 'Unreleased');
  assert.ok(versions.length > 0, 'no released versions found');
  for (const v of versions) {
    assert.notEqual(parse(v), null, `bad CHANGELOG version: ${v}`);
  }
});

test('CHANGELOG versions are listed newest first', () => {
  const { compare } = require('../../lib/semver.js');
  const versions = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)]
    .map(m => m[1])
    .filter(v => v !== 'Unreleased');
  for (let i = 1; i < versions.length; i++) {
    assert.equal(compare(versions[i - 1], versions[i]), 1,
      `${versions[i - 1]} should sort above ${versions[i]}`);
  }
});

test('every literal path in build.files exists', () => {
  for (const entry of pkg.build.files) {
    if (entry.includes('*')) continue;
    assert.ok(fs.existsSync(path.join(root, entry)), `build.files points at missing ${entry}`);
  }
});

test('build.files ships the lib/ directory the main process requires', () => {
  assert.ok(pkg.build.files.some(f => f.startsWith('lib/')),
    'lib/ is required by main.js but not listed in build.files');
});

test('the main entry point exists', () => {
  assert.ok(fs.existsSync(path.join(root, pkg.main)));
});

test('auto-update needs electron-updater as a runtime dependency', () => {
  // A devDependency would be pruned out of the packaged app and the updater
  // would throw MODULE_NOT_FOUND on first check, in production only.
  assert.ok(pkg.dependencies['electron-updater'],
    'electron-updater must be in dependencies, not devDependencies');
  assert.ok(!pkg.devDependencies?.['electron-updater']);
});

test('the publish target matches the repository the updater polls', () => {
  const { REPO } = require('../../lib/update-mode.js');
  const publish = Array.isArray(pkg.build.publish) ? pkg.build.publish[0] : pkg.build.publish;
  assert.equal(publish.provider, 'github');
  assert.equal(`${publish.owner}/${publish.repo}`, REPO,
    'electron-builder publishes somewhere the updater is not looking');
});

test('Linux ships an AppImage, the only Linux format that can self-update', () => {
  assert.ok(pkg.build.linux.target.includes('AppImage'));
});

test('every platform has a build target', () => {
  for (const platform of ['win', 'mac', 'linux']) {
    assert.ok(pkg.build[platform]?.target, `no build target for ${platform}`);
  }
});

test('the renderer loads util.js before app.js', () => {
  // app.js calls fixUrl/timeAgo/feedPath at module scope-adjacent boot time;
  // the wrong order makes the app blank-screen with a ReferenceError.
  const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
  const util = html.indexOf('util.js');
  const app = html.indexOf('app.js');
  assert.ok(util !== -1, 'index.html does not load util.js');
  assert.ok(app !== -1, 'index.html does not load app.js');
  assert.ok(util < app, 'util.js must be loaded before app.js');
});
