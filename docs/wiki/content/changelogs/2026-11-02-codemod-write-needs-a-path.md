---
title: devz codemod --write needs a path or --all
description: "devz codemod async-style, const-classes and drop-redundant-casts refuse --write with no path; pass a path, or --all for the whole working tree."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-11-02

## devz codemod --write needs a path or --all

<Badge type="warning" text="Behavior Change" />

**In one line.** `devz codemod async-style`, `const-classes` and `drop-redundant-casts` now refuse `--write` with no path, so one command typed without a path can no longer rewrite every source file under the working directory.

## What changed

- **`--write` with no path exits 2 and writes nothing.** The message says to pass a path, or `--all`. This applies to `async-style`, `const-classes` and `drop-redundant-casts`.
- **`--all` is the explicit whole-tree form.** `devz codemod async-style --write --all` rewrites every source file under the working directory, as the bare `--write` did. `--all` together with a path is an error.
- **A dry run and `--check` are unchanged.** With no path they still list or check the whole tree.
- **`model-settings` and `namespace-functions` are unchanged.** Their documented upgrade step is the bare `--write`, and they touch only a file that holds the old text.

## Who is affected

- **Scripts and people that run one of the three codemods with `--write` and no path.** Add the path you mean, or `--all`.
- **Everyone else.** No action needed.

## Details

```bash
devz codemod async-style --write                  # refused: exit 2, nothing written
devz codemod async-style packages/my-package --write
devz codemod async-style --write --all            # the whole working tree, on purpose
```
