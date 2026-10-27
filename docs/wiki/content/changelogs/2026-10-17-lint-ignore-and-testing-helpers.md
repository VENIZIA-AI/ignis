---
title: LINT_IGNORE and Shared Test Helpers
description: "A package skips generated paths in lint and format with LINT_IGNORE, and the rejection test helpers ship once from @venizia/dev-configs/testing."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-17

## LINT_IGNORE and shared test helpers

<Badge type="tip" text="New Feature" />

**In one line.** Skip a generated path with `LINT_IGNORE` in the package Makefile, and import `rejectionOf` / `expectRejection` from `@venizia/dev-configs/testing`.

```make
# packages/<name>/Makefile
LINT_IGNORE := src/_build_info.ts dev-dist/**
include ../../make/project.mk
```

```typescript
import { expectRejection } from '@venizia/dev-configs/testing';

await expectRejection({ task: repository.create({ data }), message: /duplicate key/ });
```

## What changed

- **`LINT_IGNORE`.** `make lint` and `make fmt` pass each path to oxlint and ESLint as `--ignore-pattern`, and to oxfmt as `!<glob>`. Paths resolve from the package root. An `ignorePatterns` inside `.configs/` resolves against `.configs/` and matches nothing.
- **`@venizia/dev-configs/testing`.** `rejectionOf(task)` returns what the task rejected with and fails when it resolves. `expectRejection({ task, message })` checks the rejection is an `Error` whose message contains or matches `message`. It imports `bun:test`, so use it in tests only.

## Who is affected

- **A project that copied `rejection.helper.ts`.** Delete the copy and import from `@venizia/dev-configs/testing`.
- **A package with generated files under lint.** Replace any local workaround with `LINT_IGNORE`.
