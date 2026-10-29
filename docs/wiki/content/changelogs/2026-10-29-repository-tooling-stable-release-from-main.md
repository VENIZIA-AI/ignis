---
title: Repository Tooling - A Stable Release From main With One Approval
description: 'A stable release (patch, minor, major) is published from main after one approval, then merged back into develop. For people who release IGNIS.'
packages: []
---

# Changelog - 2026-10-29

## Repository tooling

<Badge type="warning" text="Behavior Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** This entry is for people who release IGNIS, not for people who install it. The release workflow can now publish a stable release from `main`: the owner approves once, and the run publishes, tags and merges `main` back into `develop` without a second stop.

## What changed

- **One approval, for a stable only.** A prerelease runs on `develop` with no approval. A stable is dispatched on `main` and waits at the new `approve` job (environment `release-approval`); its name shows how many packages it publishes and the highest version. It runs after the gates, so an approval is never asked for a run that fails them.
- **The merge back is tried before the approval.** The plan job merges `main` back into `develop` in throwaway worktrees with the versions of the plan. A merge that would stop (anything besides the `version` field of a `package.json`) stops the run before the click.
- **Nothing moves under the approval.** The publish job refuses a stable when `main` is no longer the dispatched commit or `develop` is no longer the commit the trial read, before it changes a file or publishes.
- **The run ends with the merge back.** After the last package is published and tagged on `main`, one merge of the last release commit goes into `develop`, made from a copy of `merge-back.ts` in a worktree of `develop`. A stop there is continued by dispatching the same plan again on `main`: it publishes and tags nothing and merges back, with a new approval.
- **New scripts.** `scripts/release/merge-back.ts` and `scripts/release/sync-pr.ts` are copied from VULCAN (fe4c6771); `sync-pr.ts` reads the version of the package a tag names. It opens the Sync pull request into `main` from a gated prerelease tag and checks its tree.
- **34 guards.** Seven new guards (`approve-for-stable-only`, `publish-after-approve` which evaluates the written condition, `stable-refuses-moved-branches`, `plan-tries-the-merge-back`, `merge-back-from-a-copy`, `target-branch-by-kind`, `no-force-or-tag-move`) and `ref-by-kind` in place of the fixed `develop` rule; each has a mutation test.

## Who is affected

- **People who release.** A stable needs the new workflow on `main` first: it reaches `main` with the Sync pull request of a prerelease. Until then a stable cannot be dispatched. Nothing changes for prereleases except the plan job's extra outputs.
- **Everyone who installs IGNIS.** No action needed. No published package changes because of this entry.
