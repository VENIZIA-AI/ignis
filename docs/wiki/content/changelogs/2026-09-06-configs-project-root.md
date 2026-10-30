---
title: configs.projectRoot Replaces the getProjectRoot() Override
description: IServerApplicationConfigs gains projectRoot, so an application that overrode getProjectRoot() only to return __dirname deletes the override.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-06

## `configs.projectRoot`

<Badge type="tip" text="New Feature" />

**In one line.** The project root is a config value; the override that every application copied to return `__dirname` becomes one line.

## What changed

- **`IServerApplicationConfigs.projectRoot`** is a new optional string. `ServerApplication.getProjectRoot()` returns `configs.projectRoot ?? process.cwd()` and still binds `CoreBindings.APPLICATION_PROJECT_ROOT`.
- **The root now decides where optional peers are looked up.** `ModuleUtility.loadSync` and `assertInstalled` (mail transports, secrets providers) and the gRPC adapter resolve under `<projectRoot>/node_modules` instead of the process cwd. New: `ModuleUtility.setProjectRoot()` and `getProjectRoot()`. The pino transports resolve at the first log line, usually before an application exists, and keep using the cwd.
- **Set it only to the directory that holds `node_modules` at run time.** In a `bun build --compile` binary, `__dirname` is the compile-time directory and `import.meta.dir` is virtual, so leave the option unset (the cwd) or derive it from `process.execPath`. If the option is set and `<projectRoot>/node_modules` does not exist, the boot log carries one warning.
- **The value is read in the base constructor, before `preConfigure()`,** so it must come from the config object, not from something bound later.
- **An override of `getProjectRoot()` still wins.**

```typescript
export const configs: IServerApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  projectRoot: process.env.APP_ROOT ?? process.cwd(),
};
```

## Who is affected

- **Applications that override `getProjectRoot()` only to return `__dirname`.** Delete the override; the default (`process.cwd()`) is what peer resolution used all along. Set `projectRoot` only when the process really runs from another directory, and never to `__dirname` in a compiled binary.
- **Everyone else.** No action needed.

## Details

- Reference: [Application](/references/base/application).
