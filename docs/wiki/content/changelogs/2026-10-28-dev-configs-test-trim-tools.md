---
title: devz check test-weight, test-dead-code, test-mutate and test-controls
description: "Four dev-configs commands for trimming tests without losing coverage: the JUnit analysis, the unreferenced support files, the mutation-ledger replay and the positive-control registry check."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-28

## devz check test-weight, test-dead-code, test-mutate and test-controls

<Badge type="tip" text="New Feature" />

**In one line.** Four `devz check` commands for removing tests with proof that no behaviour loses its coverage. Additive; ships in 0.4.5.

## What changed

- **`devz check test-weight <junit.xml>...`** reads the report of `bun test --reporter=junit` and prints totals, time per package, the heaviest files, how many files hold 80% of the time, the same suite and case name in more than one file, files with zero assertions, and skips.
- **`devz check test-dead-code`** lists the fixtures and helpers under `__tests__` that no other file refers to. They are candidates, not verdicts.
- **`devz check test-mutate <ledger.json>`** replays a mutation ledger. Each line names a candidate test (to delete), a survivor test (to keep) and a break; the survivor must go red under it. A break may edit several files at once. Files are restored byte for byte, checked by checksum.
- **`devz check test-controls <registry.json>`** fails when a registered positive-control test is gone. An entry with `"kind": "file"` registers a negative fixture (a file a test needs to be absent from a result): the check fails when the file is gone.
- **`@venizia/dev-configs/checks`** also exports `analyseJunit`, `findDeadTestCode`, `replayLedger`, `checkControls` and `listTestTitles`.

## Who is affected

Nobody has to change anything. A repository that wants to trim its tests follows the method: measure, classify, prove each deletion with a mutation, delete, re-measure.
