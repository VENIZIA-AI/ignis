---
title: enable Is Optional on Middleware Options, and devz codemod Names a Path It Cannot Read
description: 'The enable field of the middleware options is optional (default true), the middleware types say what is installed, and devz codemod warns when a path you pass holds no source files.'
packages: ['@venizia/ignis-kernel', '@venizia/dev-configs']
---

# Changelog - 2026-10-26

## enable is optional on middleware options, and devz codemod names a path it cannot read

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** Three small corrections found while writing the upgrade list for a downstream app. Ships in 0.4.4.

## What changed

- **`enable` is optional on the middleware options** (`configs.middlewares.cors`, `bodyLimit` and the others). The code already treated a missing `enable` as on and only `enable: false` as off; the type now says so. Write `cors: { origin: 'https://app.example' }` without `enable: true`. Nothing changes at run time.
- **The middleware types say what is installed.** The framework installs `cors` (first) and `bodyLimit` (right after the request id). `compress`, `csrf` and `ipRestriction` are typed so a config object can carry them, but nothing reads them: wire them in `setupMiddlewares()`. A doc comment that said only `bodyLimit` was installed is corrected.
- **`devz codemod` names a path it cannot read.** `devz codemod model-settings generated/` on a folder git ignores used to print "0 file(s) would change", which looks like a clean tree. It now says that the path holds no source files the codemod may read, and that nothing was read. The exit code is unchanged.

## Who is affected

Nobody has to change anything.
