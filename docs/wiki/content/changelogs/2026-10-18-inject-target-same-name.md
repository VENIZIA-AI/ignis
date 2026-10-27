---
title: Injecting a Class That Shares Its Name With the Bound One Is an Error
description: "@inject({ target: X }) resolves the key recorded on X. When a different class of the same name is bound under that key, resolution now stops with an error naming both instead of handing back the other class."
packages: ['@venizia/ignis-inversion']
---

# Changelog - 2026-10-18

## Injecting a class that shares its name with the bound one is an error

<Badge type="danger" text="Bug Fix" />

**In one line.** Two classes with one name derive one key, so `@inject({ target: LibraryClass })` silently received the registered class; now it fails loudly.

## What changed

- **The bound class is checked.** When `@inject({ target: X })` resolves a key bound with `toClass(C)`, `C` must be `X` or a subclass of `X`. Otherwise resolution throws `... names 'X', but '<key>' is bound to a different class named 'X' | Two classes share one name and so one key - rename one, re-export the registered one, or inject by key`. A value or provider binding is not checked.
- **A subclass override still resolves.** Binding `OverrideStore` under `BaseStore`'s key and injecting `BaseStore` works as before.

## Who is affected

- **Applications with two decorated classes of one name** (a library's own copy of a class the application registers). They used to get the registered class without a word; now boot (with `bootChecks.binding.doVerify`) or the first resolution names the clash. Keep one class - a re-export of the registered one - or rename the other.
- **Everyone else.** No change.

**Files:** [`packages/inversion/src/modules/container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/inversion/src/modules/container/container.ts)
