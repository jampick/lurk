# Changelog

All notable changes to Lurk are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and Lurk adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [docs/VERSIONING.md](docs/VERSIONING.md) for what counts as a breaking
change in a desktop app, and [RELEASING.md](RELEASING.md) for how to cut one.

## [Unreleased]

### Added
- The left sidebar collapses out of the way, from a button in the topbar or
  with Ctrl+B. The choice is remembered between launches.

## [0.2.1] - 2026-08-25

### Fixed
- Release builds no longer fail on macOS when code-signing secrets are not
  configured. An unset secret arrives as an empty string, which electron-builder
  treated as a file path — so the macOS installer was never produced (#29).

### Changed
- CI actions updated to `checkout@v5` and `setup-node@v5`, clearing the Node 20
  deprecation warning on every run (#31).

## [0.2.0] - 2026-08-25

### Added
- Automatic update checks against GitHub Releases, with a desktop notification
  and an in-app banner when a new version is available. Windows (NSIS) and Linux
  (AppImage) install updates in place; macOS and `.deb`/`.pacman` installs are
  told about the update and linked to the download page (#22).
- "Check for updates" button and the running version in the sidebar footer.
- Test suite: unit tests on `node:test` plus a Playwright smoke test that
  launches the real Electron app (#22). The electron-builder config is
  validated against its own schema in-process, so a bad `build` key fails in
  `npm test` rather than partway through a release build.
- Continuous integration on every pull request, with auto-merge once checks pass (#22).
- Issue forms, a pull request template, and a contributing guide.
- Linux `pacman` package target, alongside AppImage and deb.

### Changed
- Pure helpers moved out of `renderer/app.js` into `renderer/util.js` and `lib/`
  so they can be unit tested.
- `reddit:fetch` now validates the requested path against a stricter allowlist.

### Fixed
- An anchor with an empty `href` in Reddit-supplied HTML no longer turns into a
  link to the Reddit homepage; the href is stripped as intended.
- Linux builds now set a desktop entry name, so tiling window managers such as
  Hyprland associate Lurk's window with its launcher entry — fixing a generic
  window icon and `windowrule` entries that failed to match (#27).

## [0.1.1] - 2026-08-24

### Added
- Omarchy theme integration: Lurk follows the desktop theme and retints live.
- Live post mode with auto-refreshing comments and a taskbar badge.
- Comment sorting: Best, Top, New, Controversial, Old, Q&A.

### Fixed
- HLS playback pinned to the top variant to stabilise audio.
- Only one video plays audibly at a time.

## [0.1.0] - 2026-07-24

### Added
- First release: media-first Reddit feed, comments panel, subreddit sidebar,
  search, infinite scroll, and Windows/macOS/Linux packages.

[Unreleased]: https://github.com/jampick/lurk/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/jampick/lurk/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jampick/lurk/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jampick/lurk/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jampick/lurk/releases/tag/v0.1.0
