#!/usr/bin/env node
/*
 * Assert that the packaged app actually contains the files main.js requires.
 *
 * `build.files` in package.json is an allowlist. Adding a require() without
 * adding its directory there produces an app that passes every test, packages
 * without warning, and then throws MODULE_NOT_FOUND on the user's machine.
 * That is exactly the failure this catches.
 *
 * Run after `electron-builder --dir`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('verify-package: dist/ not found — run electron-builder --dir first.');
  process.exit(1);
}

// linux-unpacked / win-unpacked / mac, depending on which runner built it.
const unpackedDir = readdirSync(dist).find(d => /unpacked|^mac/.test(d));
if (!unpackedDir) {
  console.error(`verify-package: no unpacked build in dist/ (saw: ${readdirSync(dist).join(', ')})`);
  process.exit(1);
}

function findAsar(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      const hit = findAsar(full);
      if (hit) return hit;
    } else if (name.name === 'app.asar') {
      return full;
    }
  }
  return null;
}

const asarPath = findAsar(join(dist, unpackedDir));
if (!asarPath) {
  console.error('verify-package: could not find app.asar in the unpacked build.');
  process.exit(1);
}

const { listPackage } = require('@electron/asar');
const entries = listPackage(asarPath).map(e => e.replace(/\\/g, '/').replace(/^\//, ''));

const REQUIRED = [
  'main.js',
  'preload.js',
  'omarchy.js',
  'lib/og.js',
  'lib/reddit-path.js',
  'lib/semver.js',
  'lib/update-mode.js',
  'lib/updater.js',
  'renderer/index.html',
  'renderer/app.js',
  'renderer/util.js',
  'renderer/styles.css',
  'node_modules/hls.js/dist/hls.min.js',
  // electron-updater is required at runtime on the auto-update path; if it is
  // pruned, updates fail in production and nowhere else.
  'node_modules/electron-updater/package.json'
];

const missing = REQUIRED.filter(f => !entries.includes(f));

if (missing.length) {
  console.error(`verify-package: ${missing.length} required file(s) missing from ${asarPath}:`);
  for (const f of missing) console.error(`  - ${f}`);
  console.error('\nAdd them to "build.files" in package.json.');
  process.exit(1);
}

console.log(`verify-package: OK — ${entries.length} entries, all ${REQUIRED.length} required files present.`);
