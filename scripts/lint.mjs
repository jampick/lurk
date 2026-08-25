#!/usr/bin/env node
/*
 * Zero-dependency source check.
 *
 * Runs `node --check` over every first-party .js/.mjs file and parses every
 * JSON file. This is not a style linter — it exists so that a typo in a file
 * only exercised at runtime (renderer/app.js is 1100 lines the unit tests
 * barely touch) fails CI instead of shipping.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'test-results', 'playwright-report']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const files = walk(root);
const scripts = files.filter(f => ['.js', '.mjs'].includes(extname(f)));
const jsons = files.filter(f => extname(f) === '.json' && !f.includes('package-lock'));

let failures = 0;

for (const file of scripts) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failures++;
    console.error(`✗ ${relative(root, file).split(sep).join('/')}`);
    console.error(String(err.stderr || err.message).trim().split('\n').slice(0, 6).join('\n'));
  }
}

for (const file of jsons) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    failures++;
    console.error(`✗ ${relative(root, file).split(sep).join('/')}: ${err.message}`);
  }
}

const checked = scripts.length + jsons.length;
if (failures) {
  console.error(`\nlint: ${failures} of ${checked} files failed`);
  process.exit(1);
}
console.log(`lint: ${checked} files OK (${scripts.length} js, ${jsons.length} json)`);
