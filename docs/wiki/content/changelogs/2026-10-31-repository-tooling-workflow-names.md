---
title: Repository Tooling - Checks, Release and Docs Workflows With Short Run Titles
description: 'The Actions list shows three workflows, Checks, Release and Docs; a release run is titled with its kind, versions, packages, issue and commit, and the atlas index is a job of Docs. For people who release IGNIS.'
packages: []
---

# Changelog - 2026-10-31

## Repository tooling

<Badge type="tip" text="Enhancement" />

**In one line.** This entry is for people who release IGNIS, not for people who install it. The Actions list of this repository shows `Checks`, `Release` and `Docs`, and a release run says what it releases in its title.

## What changed

- **Release.** `package-release.yml` is named `Release`. A run started with `make release` is titled `Release · stable · 0.4.6 boot,kernel; 0.4.5 filter · #664 · c84852a`: the kind, each version from the highest down with its packages, the issue and the short commit. The workflow cannot work these out when it names the run, so `release.ts` sends them as the optional `label` input and the `plan` job refuses a label that is not the one it computes. A dispatch by hand has no label and is titled with the mode, the issue and the whole commit. The file name, the job names (the publish job is still `NPM Release`) and the environments are unchanged, so npm trusted publishing and the approval keep working.
- **Checks.** `ci.yml` is named `Checks`, titled by the pull request title or the branch name.
- **Docs.** `deploy-docs.yml` is named `Docs`, titled `Docs · <branch>`. The atlas index is a job of it, with the triggers it had: a push to `main`, `develop` or a tag publishes the atlas pair. A push to `develop` that touches `docs/wiki/` deploys the wiki, as before. `atlas-index.yml` is gone.

## Who is affected

- **Anyone who starts the release by hand.** Use `make release`; it fills the title.
- **Everyone who installs IGNIS.** No action needed. No published package changes because of this entry.

## Details

- Not run: a real Release run with a label, and the first runs of the Docs jobs on GitHub. The workflow guards (`run-name-carries-commit` changed, `plan-checks-the-label` new) and the tests cover the files, not an Actions run. The first real runs are the check; a wrong `if` shows as a skipped job.
