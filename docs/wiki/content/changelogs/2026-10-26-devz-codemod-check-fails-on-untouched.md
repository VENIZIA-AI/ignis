---
title: devz codemod --check Fails While a Model Is Left Untouched
description: 'devz codemod model-settings --check now exits 1 when a model is left untouched, not only when a file would change, and the codemod reports a @model with a variable argument or an aliased import instead of skipping it.'
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-26

## devz codemod --check fails while a model is left untouched

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** A green `--check` used to mean "nothing to rewrite", even when models were left for you to fix by hand. Those models still throw when the decorator runs, so `--check` now fails on them too. Ships in 0.4.4.

```bash
bunx devz codemod model-settings --check   # exits 1 if a file would change OR a model is left untouched
```

## What changed

- **`--check` exits 1 for a left-untouched model.** Before, it exited 1 only when a file would change. A tree whose only findings were a variable `settings`, a spread or a shorthand key exited 0 and the CI job stayed green, while every one of those models throws a "removed settings key" error at boot. The output now ends with a line that says so. Without a flag, and with `--write`, the exit code is unchanged (0).
- **`@model(options)` is reported.** A `@model` call whose argument is a variable or a call, not an object literal, was skipped without a word. It is now listed with its file and line as left untouched.
- **An aliased `@model` is read.** `import { model as m } from '@venizia/ignis'` with `@m({ ... })`, and `import * as ignis from '@venizia/ignis-kernel'` with `@ignis.model({ ... })`, are migrated like `@model`. An alias imported from any other package is not a `@model` decorator and is ignored.

## Who is affected

A CI job that runs `--check` and has models the codemod cannot rewrite: it fails now, and the report names each file and line. Fix those models by hand with the [mapping table](/changelogs/2026-10-26-remove-deprecated-model-settings#migrate), then run `--check` again. Nobody else needs to do anything.
