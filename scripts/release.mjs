#!/usr/bin/env node
/*
 * Cut a release.
 *
 *   npm run release -- patch          0.1.1 -> 0.1.2
 *   npm run release -- minor          0.1.1 -> 0.2.0
 *   npm run release -- major          0.1.1 -> 1.0.0
 *   npm run release -- 0.3.0-rc.1     explicit version
 *   npm run release -- minor --dry-run
 *
 * Bumps package.json, rolls CHANGELOG's [Unreleased] section into a dated
 * version section, commits and tags. Pushing the tag is left to you — that is
 * the irreversible step, and it is what triggers the release workflow.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const PKG = join(root, 'package.json');
const CHANGELOG = join(root, 'CHANGELOG.md');
const REPO_URL = 'https://github.com/jampick/lurk';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const allowDirty = args.includes('--allow-dirty');
const bump = args.find(a => !a.startsWith('--'));

function die(msg) {
  console.error(`\nrelease: ${msg}\n`);
  process.exit(1);
}

function git(...a) {
  return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
}

if (!bump) die('usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run]');

/* ---- preflight ---- */

if (!allowDirty && git('status', '--porcelain')) {
  die('working tree is dirty. Commit or stash first (or pass --allow-dirty).');
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main' && !dryRun) {
  die(`releases are cut from main, not ${branch}.`);
}

/* ---- work out the next version ---- */

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const current = pkg.version;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

const m = SEMVER.exec(current);
if (!m) die(`current version "${current}" is not SemVer.`);
const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];

let next;
if (bump === 'patch') next = `${major}.${minor}.${patch + 1}`;
else if (bump === 'minor') next = `${major}.${minor + 1}.0`;
else if (bump === 'major') next = `${major + 1}.0.0`;
else next = bump.replace(/^v/, '');

if (!SEMVER.test(next)) die(`"${next}" is not a valid SemVer version.`);
if (next === current) die(`version is already ${current}.`);

const tag = `v${next}`;
const existingTags = git('tag', '--list').split('\n').map(s => s.trim());
if (existingTags.includes(tag)) die(`tag ${tag} already exists.`);

/* ---- roll the changelog ---- */

const changelog = readFileSync(CHANGELOG, 'utf8');
const unreleasedStart = changelog.indexOf('## [Unreleased]');
if (unreleasedStart === -1) die('CHANGELOG.md has no "## [Unreleased]" section.');

const afterHeading = changelog.indexOf('\n', unreleasedStart) + 1;
const nextSection = changelog.indexOf('\n## [', afterHeading);
const body = changelog.slice(afterHeading, nextSection === -1 ? undefined : nextSection).trim();

if (!body) {
  die('the [Unreleased] section is empty — nothing to release.\n'
    + '        Describe the changes in CHANGELOG.md first.');
}

// Date in UTC so the changelog reads the same wherever it is cut from.
const today = new Date().toISOString().slice(0, 10);

const rolled = changelog.slice(0, unreleasedStart)
  + `## [Unreleased]\n\n`
  + `## [${next}] - ${today}\n\n${body}\n\n`
  + changelog.slice(nextSection === -1 ? changelog.length : nextSection + 1);

// Rewrite the reference links at the foot of the file.
const withLinks = rolled
  .replace(
    /^\[Unreleased\]:.*$/m,
    `[Unreleased]: ${REPO_URL}/compare/${tag}...HEAD\n[${next}]: ${REPO_URL}/compare/v${current}...${tag}`);

/* ---- apply ---- */

console.log(`\n  ${current}  ->  ${next}   (tag ${tag})\n`);
console.log('  Release notes:\n');
console.log(body.split('\n').map(l => '    ' + l).join('\n'));
console.log();

if (dryRun) {
  console.log('  --dry-run: nothing written.\n');
  process.exit(0);
}

pkg.version = next;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(CHANGELOG, withLinks);

// Keep the lockfile's version field in step, without touching the dep tree.
try {
  execFileSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'],
    { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' });
} catch {
  console.warn('  ! could not refresh package-lock.json — check it before pushing');
}

git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', `Lurk ${next}`);

console.log(`  Committed and tagged ${tag}.\n`);
console.log('  Push to trigger the release build:\n');
console.log(`      git push origin main --follow-tags\n`);
