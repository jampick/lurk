# Versioning

Lurk uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):
`MAJOR.MINOR.PATCH`.

SemVer is written for libraries, where "breaking change" means a changed
function signature. Lurk is a desktop app with no API, so here is what each
number actually means for it.

## MAJOR — the user has to do something

Bump when an update requires manual intervention or takes something away:

- Saved data changes format in a way that is not migrated automatically
  (subreddit list, read-post history, preferences in `localStorage`).
- A feature is removed, or a keyboard shortcut changes meaning.
- The minimum supported OS version rises.
- The update mechanism itself changes such that older versions cannot
  auto-update to the new one.

While Lurk is `0.x`, the MINOR position does this job — see below.

## MINOR — new things, nothing lost

- New features and new UI.
- New platform or package format.
- Changes in appearance or default behaviour that don't destroy anything.
- Dependency upgrades that change observable behaviour, including Electron
  major versions.

## PATCH — fixes only

- Bug fixes, performance work, crash fixes.
- Security fixes.
- Refactoring, tests, docs, CI, packaging — anything invisible to the user.

## While Lurk is 0.x

Under SemVer, major version zero means anything can change. In practice Lurk
shifts each rule down one position:

| Change | 0.x version | After 1.0 |
| --- | --- | --- |
| Breaking / data migration | `0.2.0` → `0.3.0` | `1.4.2` → `2.0.0` |
| New feature | `0.2.0` → `0.3.0` | `1.4.2` → `1.5.0` |
| Bug fix | `0.2.0` → `0.2.1` | `1.4.2` → `1.4.3` |

So during `0.x` a MINOR bump covers both new features and breaking changes; the
CHANGELOG is where the difference is spelled out. Lurk goes to `1.0.0` when the
saved-data format is settled and auto-update has proven itself across a few
releases on all three platforms.

## Prereleases

`0.3.0-rc.1`, `0.3.0-beta.2`. Ordered by SemVer rules — `0.3.0-rc.1` sorts
*below* `0.3.0`, which is what stops a release candidate from being offered as
an upgrade over the final release.

The release workflow marks any tag containing a hyphen as a GitHub prerelease
and does not mark it "latest", so installed copies on the stable channel are
not offered it.

## What carries the version

| Place | Set by | Notes |
| --- | --- | --- |
| `package.json` `version` | `npm run release` | The source of truth. |
| Git tag `vX.Y.Z` | `npm run release` | What triggers the release build. |
| `CHANGELOG.md` heading | `npm run release` | Rolled from `[Unreleased]`. |
| GitHub release title | Release workflow | `Lurk X.Y.Z`. |
| `latest*.yml` on the release | electron-builder | What the updater reads. |
| Sidebar footer in-app | `app.getVersion()` | Reads `package.json`. |

These are checked against each other: the release workflow refuses to build if
the tag and `package.json` disagree, or if the CHANGELOG has no section for the
version, and `test/unit/packaging.test.js` enforces the same rules on every PR.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). PR
titles are checked against this format by CI, because squash-merge turns the PR
title into the commit subject, and those subjects appear in release notes.

```
feat(updates): notify when a new version is available
fix(comments): stop the live poll leaking a timer
chore(deps): bump electron to 43.2.0
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `revert`. Scope is optional.

The type does not automatically pick the version bump — that is a judgement
call made when cutting the release, using the table above.
