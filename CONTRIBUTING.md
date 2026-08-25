# Contributing to Lurk

## Getting set up

```bash
git clone git@github.com:jampick/lurk.git
cd lurk
npm install
npm start
```

Node 20 or newer. `npm install` downloads an Electron binary, so the first run
takes a while.

## The loop

Every change starts with an issue and ends with a squash-merged PR.

```
issue  →  branch  →  PR (linked to the issue)  →  CI green  →  auto-merge
```

### 1. Open an issue

Use one of the [issue forms](https://github.com/jampick/lurk/issues/new/choose).
This is not ceremony for its own sake — the issue number is what ties a line in
the CHANGELOG to the reasoning behind it, months later. CI enforces that every
PR references one.

### 2. Branch

Branch from `main`, named `<type>/<short-description>`:

```bash
git switch main && git pull
git switch -c fix/gallery-first-image-only
```

### 3. Make the change

- Match the surrounding style. There is no formatter; the codebase is
  consistent by hand and comments explain *why*, not *what*.
- Pure logic goes in `renderer/util.js` or `lib/` so it can be unit tested.
  Anything touching the DOM stays in `renderer/app.js`.
- Add a note under `## [Unreleased]` in `CHANGELOG.md` for anything a user
  would notice.

### 4. Test

```bash
npm test            # lint + unit tests — run this constantly
npm run test:e2e    # launches the real app; slower
```

Add tests for new logic. `test/unit/` is plain [`node:test`](https://nodejs.org/api/test.html),
no framework to learn:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { compact } = require('../../renderer/util.js');

test('compact abbreviates thousands', () => {
  assert.equal(compact(1500), '1.5k');
});
```

### 5. Open a PR

Title must follow [Conventional Commits](docs/VERSIONING.md#commit-messages) —
CI checks it, and it becomes the squash commit subject:

```
fix(media): show every image in a gallery post
```

Fill in the template, including `Closes #12`.

### 6. Merge

Auto-merge is enabled on every non-draft PR. Once the `CI passed` check goes
green, GitHub squash-merges it and deletes the branch. Nothing merges with a
red build.

To stop that happening — a PR you want a human to look at first — either open
it as a draft, or add the `do-not-merge` label.

## What CI checks

| Check | What it catches |
| --- | --- |
| `Lint` | Syntax errors in any JS or JSON file, including files no test loads. |
| `Unit (×3 OS)` | Logic in `lib/`, `renderer/util.js`, `omarchy.js`, plus version/CHANGELOG consistency. |
| `Smoke (×3 OS)` | The app fails to launch, the preload bridge is wrong, the renderer throws at boot. |
| `Package check` | A `require()` whose file is not in `build.files` — breaks only in the packaged app. |
| `Linked issue` | A PR with no issue reference. Override with the `no-issue` label. |
| `Conventional title` | A PR title that would produce a useless commit subject. |

`CI passed` is the single required check; it aggregates the rest.

## Project layout

```
main.js              Electron main process: windows, IPC, Reddit fetching
preload.js           The contextBridge — the only surface the renderer sees
omarchy.js           Omarchy/Linux desktop theme integration
lib/                 Pure main-process modules (unit tested)
  og.js              og:image extraction for link previews
  reddit-path.js     Validation for renderer-supplied API paths
  semver.js          Version comparison for update checks
  update-mode.js     Whether this install can self-update
  updater.js         Update checking and notification
renderer/
  index.html         App shell + CSP
  util.js            Pure helpers, shared with the test suite
  app.js             Everything DOM
  styles.css         All styling; palette lives in :root
scripts/             lint, release, release notes, package verification
test/unit/           node:test
test/e2e/            Playwright, launches the real app
omarchy/             Theme template + installer for Omarchy desktops
```

## Releasing

Maintainers only — see [RELEASING.md](RELEASING.md).
