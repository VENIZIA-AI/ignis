---
title: The skipMigrate Warning Names the Right Replacement, and enable Is Optional on Middleware Options
description: "The deprecation warning for skipMigrate: false names migration: { use: true } instead of use: false. The enable field of the middleware options is optional (default true). devz codemod warns when a path you pass holds no source files."
packages: ['@venizia/ignis-kernel', '@venizia/dev-configs']
---

# Changelog - 2026-10-26

## The skipMigrate warning names the right replacement, and enable is optional

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** Three small corrections found while writing the upgrade list for a downstream app.

## What changed

- **The `skipMigrate` warning is right for `false`.** It always said `use migration: { use: false } instead`. For `skipMigrate: false` the replacement is `migration: { use: true }` (or no key at all, because `true` is the default), so the warning now says that. The text for `skipMigrate: true` is unchanged. The changelog for the `type` and `migration` settings printed a different text (`use migration.use instead`); it now prints the real one.
- **`enable` is optional on the middleware options** (`configs.middlewares.cors`, `bodyLimit` and the others). The code already treated a missing `enable` as on and only `enable: false` as off; the type now says so. Write `cors: { origin: 'https://app.example' }` without `enable: true`. Nothing changes at run time.
- **The middleware types say what is installed.** The framework installs `cors` (first) and `bodyLimit` (right after the request id). `compress`, `csrf` and `ipRestriction` are typed so a config object can carry them, but nothing reads them: wire them in `setupMiddlewares()`. A doc comment that said only `bodyLimit` was installed is corrected.
- **`devz codemod` names a path it cannot read.** `devz codemod model-settings generated/` on a folder git ignores used to print "0 file(s) would change", which looks like a clean tree. It now says that the path holds no source files the codemod may read, and that nothing was read. The exit code is unchanged.

## Who is affected

Nobody has to change anything. If you grep your logs for the old `skipMigrate` text, it reads `use migration: { use: false } instead` for `skipMigrate: true` and `use migration: { use: true } (or no key, true is the default) instead` for `skipMigrate: false`.
