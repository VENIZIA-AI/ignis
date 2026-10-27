---
title: devz codemod Is a Dry Run Unless You Pass --write
description: 'devz codemod model-settings no longer writes by default, reads only the files git knows (so ignored folders and worktrees are never rewritten), prints usage on --help and refuses an unknown flag. devz clean --help no longer deletes, and devz with no argument prints the commands.'
packages: ['@venizia/dev-configs', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-26

## devz codemod is a dry run unless you pass --write

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** `devz codemod model-settings` used to rewrite files as soon as you ran it. It now only lists what it would change; add `--write` to apply.

```bash
bunx devz codemod model-settings           # dry run: lists the files, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bunx devz codemod model-settings --check   # dry run that exits 1 if anything would change (CI)
```

## What changed

- **Dry run by default.** Without `--write` nothing is written, and the output ends with a line that says how to apply. `--check` is the same dry run and exits 1 when anything would change. `--write` together with `--check` is refused.
- **Ignored folders are never entered.** The 0.4.2 command skipped only `node_modules`, `dist`, `build` and `.git`, so run from a repository root it walked into `.agents/local/worktrees/` and rewrote another clone. Inside a git repository it now reads `git ls-files --cached --others --exclude-standard`: tracked files, plus untracked files git does not ignore. A nested repository is skipped too. Outside git it skips every dot-directory as well as the old list.
- **`--help` prints the usage and exits 0** without reading or writing anything. `-h` works too.
- **An unknown flag is an error.** `--halp` used to be read as a path and the command wrote files; it now prints the usage, exits 2 and writes nothing. An unknown codemod name also exits 2 (it was 1).
- **`devz clean --help` no longer deletes.** `clean` ignored its arguments, so `devz clean --help` removed `dist` and the `*.tsbuildinfo` files. `--help` and `-h` now print the usage and exit 0; any other argument exits 2 and deletes nothing.
- **`devz` and `devz --help` print the command list** and exit 0 (they exited 1 with "unknown command").
- **The decorator error says `--write`.** The message a model throws for a removed settings key now reads `run 'devz codemod model-settings --write' to rewrite them`.

## Who is affected

Anyone who ran `devz codemod model-settings` expecting it to write: add `--write`. A CI job that ran `--check` is unchanged. Pass a path explicitly (`devz codemod model-settings src/models`) to run on a folder; a path that git ignores is read as empty.
