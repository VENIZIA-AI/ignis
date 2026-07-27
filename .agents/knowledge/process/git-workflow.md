---
type: Playbook
title: Git workflow
description: Branch naming, commit style, PR target, and the pre-commit hook for IGNIS.
resource: CONTRIBUTING.md
tags: [process, git, contributing]
---

## Steps

1. Sync with `develop` before branching: `git fetch upstream && git checkout develop && git merge
   upstream/develop` (or `origin` if you have direct push access), then branch off it.
2. Name the branch by its kind:
   - `feature/description` for new features
   - `fix/description` for bug fixes
   - `docs/description` for documentation-only changes
   - `chore/description` for maintenance (deps, config)
3. Commit using Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
4. Before committing, run `bun run lint:fix` and `make build` to catch style and type issues early
   - the pre-commit hook (below) will block a commit that fails lint anyway.
5. If git hooks aren't wired up yet, run `make setup-hooks` once - it runs `git config
   core.hooksPath .githooks`, pointing git at the repo's `.githooks/` directory instead of
   `.git/hooks/`.
6. `.githooks/pre-commit` then runs on every commit: it `cd`s to the repo root and runs `make
   lint-all` (packages AND examples), under `set -e` - any lint failure aborts the commit before it
   is created. There is no test step in this hook; passing tests is not enforced automatically.
7. Push the branch and open a Pull Request that targets `develop`. Never target `main` - `main`
   only accepts merges FROM `develop`, and releases off it are tagged in git (see
   [release and publish](/process/release-publish.md) for the actual per-package release
   mechanism, which is separate from `main`/`develop` merges).
8. PR title should also follow Conventional Commits format (e.g. `feat: add Redis caching`).
   Include what and why in the description, link related issues, and clearly call out breaking
   changes.

## Related

- [Release and publish](/process/release-publish.md)
- [Build system](/process/build-system.md)
- [Testing](/process/testing.md)
