#!/usr/bin/env node
/*
 * Print the GitHub Release body for a version.
 *
 *   node scripts/release-notes.mjs v0.2.0
 *
 * The CHANGELOG is the source of truth for what changed — it is written by a
 * human and says why. Commits since the previous tag are appended underneath
 * as a "Commits" section so nothing is silently missing from the record, and
 * install guidance is appended because "which file do I download" is the most
 * common question a release page gets.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const REPO_URL = 'https://github.com/jampick/lurk';

const raw = process.argv[2];
if (!raw) {
  console.error('usage: node scripts/release-notes.mjs <version|vX.Y.Z>');
  process.exit(1);
}
const version = raw.replace(/^v/, '');
const tag = `v${version}`;

/* ---- the human-written section ---- */

function changelogSection() {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start === -1) return null;
  const from = changelog.indexOf('\n', start) + 1;
  const next = changelog.indexOf('\n## [', from);
  return changelog.slice(from, next === -1 ? undefined : next).trim();
}

/* ---- the commit log, as a backstop ---- */

function previousTag() {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0', `${tag}^`],
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;   // first release
  }
}

function commitsSince(prev) {
  const range = prev ? `${prev}..${tag}` : tag;
  let log;
  try {
    log = execFileSync('git', ['log', '--no-merges', '--pretty=format:%s (%h)', range],
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return [];
  }
  return log ? log.split('\n')
    // The release commit itself is noise on its own release page.
    .filter(line => !/^chore\(release\):/.test(line))
    : [];
}

const INSTALL = `### Install

| Platform | File | Updates |
| --- | --- | --- |
| Windows | \`Lurk-Setup-${version}.exe\` | Automatic |
| Linux (any distro) | \`Lurk-${version}.AppImage\` | Automatic |
| Linux (Debian/Ubuntu) | \`.deb\` | Notified in app, install manually |
| Linux (Arch) | \`.pacman\` | Notified in app, install manually |
| macOS | \`.dmg\` | Notified in app, install manually |

The AppImage is the one to take on Arch/Omarchy — it is the only Linux format
that can update itself in place. macOS is notify-only until the app is signed.`;

/* ---- assemble ---- */

const parts = [];
const section = changelogSection();

if (section) {
  parts.push(section);
} else {
  parts.push(`_No CHANGELOG entry for ${version}._`);
}

const prev = previousTag();
const commits = commitsSince(prev);
if (commits.length) {
  parts.push(`<details>\n<summary>Commits (${commits.length})</summary>\n\n`
    + commits.map(c => `- ${c}`).join('\n')
    + '\n\n</details>');
}

parts.push(INSTALL);

if (prev) {
  parts.push(`**Full changelog**: ${REPO_URL}/compare/${prev}...${tag}`);
}

process.stdout.write(parts.join('\n\n') + '\n');
