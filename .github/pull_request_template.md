<!--
Title must follow Conventional Commits — it becomes the squash commit and feeds
the release notes. e.g. "feat(updates): notify when a new version is available"
-->

## What changed

<!-- One or two sentences. The "why" matters more than the "what". -->

## Linked issue

<!--
Required. Use a closing keyword so the issue closes on merge:
    Closes #12
If this genuinely needs no issue (typo, comment fix), add the `no-issue` label.
-->

Closes #

## How it was tested

<!-- Tick what applies, and say what you did manually. -->

- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes
- [ ] Tested manually on: <!-- Windows / macOS / Linux + desktop -->

## Checklist

- [ ] `CHANGELOG.md` updated under `## [Unreleased]` (skip for internal-only changes)
- [ ] New behaviour has a test, or there is a note below saying why it does not
- [ ] No new runtime dependency, or the reason for it is explained below
