---
title: devz codemod lists its codemods and can reverse the two migrations
description: "devz codemod --list prints the codemod names. namespace-functions and connector-imports take --reverse to apply their table backward for a downgrade."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-12

## devz codemod lists its codemods and can reverse the two migrations

<Badge type="tip" text="New Feature" />

**In one line.** `devz codemod --list` names every codemod, and the two migration codemods can undo themselves, so a downgrade is as scripted as an upgrade.

## What changed

- **`devz codemod --list`.** Prints one codemod name per line and nothing else.
- **`--reverse` on `namespace-functions`.** Applies the mapping table backward: `ClassName.method({ first: a })` becomes `oldName(a)` and the import follows. A call that is not one object literal of the entry's keys is reported and left. The `ApplicationLogger` rule is not reversed.
- **`--reverse` on `connector-imports`.** Moves `@venizia/ignis-connectors/<sub-path>` back to `@venizia/ignis/<sub-path>`.
- **The style codemods are not migrations.** `drop-redundant-casts`, `const-classes` and `async-style` answer `--reverse` with `not reversible` and exit 2.

`--reverse` is a dry run unless you pass `--write`, like the forward run, and `--write` still refuses a file with local changes.

## Who is affected

- **Apps that downgrade across a migration.** Run `devz codemod namespace-functions --reverse --write` or `devz codemod connector-imports --reverse --write` after you pin the older version.
- **Everyone else.** No action needed.
