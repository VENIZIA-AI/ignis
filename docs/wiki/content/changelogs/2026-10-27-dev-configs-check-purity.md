---
title: devz check purity - the Browser-Purity Gate Ships in dev-configs
description: "The browser-purity gate of IGNIS moves into @venizia/dev-configs as devz check purity and the new ./checks export. A repository keeps only its claims. Output is identical; the gate also refuses an entry that reaches dev-configs."
packages: ['@venizia/dev-configs']
---

# Changelog - 2026-10-27

## devz check purity ships in dev-configs

<Badge type="tip" text="Enhancement" />

**In one line.** The probe, the derivation of rows from `exports` and the report that `make purity` ran from this repository's scripts are now `devz check purity --claims <file>`, so ARDOR and VULCAN use the same engine instead of copies. Nothing changes for an application. Ships in 0.4.4.

## What changed

- **`devz check purity --claims <file> [package] [--json]`.** Probes every entry the claims file lists as browser-pure. `make purity` and `make purity-<package>` call it; the report is byte for byte what the script printed, on every package and for a package filter that matches nothing (exit 1).
- **`@venizia/dev-configs/checks`.** A new export with `buildManifest`, `deriveEntries`, `assertNoWorkspaceExternal`, `assertBrowserEsmEntry`, `probeEntry` and `checkPurity` for a repository that wants the engine in its own tests.
- **`--json`.** Prints the verdict per entry (verdict, size, builtins, globals) with the repository root replaced by `<root>`, so two machines on one commit print the same text.
- **The gate is one check stricter.** An entry whose bundle contains `@venizia/dev-configs` fails: that package is Bun-only tooling and must never reach a browser.
- **The scratch file** moved from the system temp to `.agents/local/tmp` under the folder the command runs in.

## Who is affected

Nobody who only uses IGNIS. A repository that copied the old scripts replaces them with a claims file that exports `PURITY_CLAIMS`; the guide is in [Checking browser purity](/best-practices/code-style-standards/tooling#checking-browser-purity).
