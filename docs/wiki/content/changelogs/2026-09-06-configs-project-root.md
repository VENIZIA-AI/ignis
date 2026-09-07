---
title: configs.projectRoot Replaces the getProjectRoot() Override
description: IServerApplicationConfigs gains projectRoot; ServerApplication.getProjectRoot() returns it when set and process.cwd() otherwise, binding CoreBindings.APPLICATION_PROJECT_ROOT as before. An application that overrode the method only to return __dirname deletes the override.
---

# Changelog - 2026-09-06

## `configs.projectRoot`

<Badge type="tip" text="New Feature" />

**In one line.** The project root is a config value; the override that every application copied to return `__dirname` becomes one line.

```typescript
export const configs: IServerApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  projectRoot: process.env.APP_ROOT ?? process.cwd(),
};
```

## The problem it solves

`ServerApplication.getProjectRoot()` returned `process.cwd()`. An application whose root is the directory of its application file overrode the method with the same three lines, changing only `process.cwd()` to `__dirname`. Sixteen packages in one consumer carried that copy.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `IServerApplicationConfigs.projectRoot` | New optional string | core-server |
| `ServerApplication.getProjectRoot()` | Returns `configs.projectRoot ?? process.cwd()`; still binds `CoreBindings.APPLICATION_PROJECT_ROOT`; hands the value to `ModuleUtility.setProjectRoot()` | core-server |
| `ModuleUtility.setProjectRoot()` / `getProjectRoot()` | New; every optional-peer lookup (`loadSync`, `assertInstalled`) resolves under `<projectRoot>/node_modules` instead of the process cwd | helpers |
| `GrpcRequestAdapter` | Resolves `@connectrpc/connect` under the same root | core-server |

- Until now the binding had no reader: nothing in the framework resolved anything from it. It now decides where optional peers are looked up: `ModuleUtility.loadSync`/`assertInstalled` (mail transports, the secrets providers) and the gRPC adapter. The pino transports resolve at the first log line, usually before an application exists, and keep using the cwd.
- Set `projectRoot` only to the directory that holds `node_modules` **at run time**. In a `bun build --compile` binary `__dirname` is the compile-time directory and `import.meta.dir` is virtual, so a binary leaves the option unset (the cwd) or derives it from `process.execPath`. When the option is set and `<projectRoot>/node_modules` does not exist, the boot log carries one warning.
- The value is read in the base constructor, before `preConfigure()`, so it must come from the config object, not from something bound later.
- An override of `getProjectRoot()` still wins; nothing forces the change.

## Who is affected

- **Applications that override `getProjectRoot()` only to return `__dirname`.** (A consumer that already deleted its overrides keeps the cwd and sees no change at this bump.) Delete the override; the default (`process.cwd()`) is what peer resolution used all along. Set `projectRoot` only when the process really runs from another directory, and never to `__dirname` in a compiled binary.
- **Everyone else.** No action needed.

## Details

- Reference: [Application](/references/base/application).
