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
  projectRoot: __dirname,
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

- Until now the binding had no reader: nothing in the framework resolved anything from it. It now decides where optional peers are looked up, so a compiled binary or a process started from another directory sets `projectRoot` to where its `node_modules` lives.
- The value is read in the base constructor, before `preConfigure()`, so it must come from the config object, not from something bound later.
- An override of `getProjectRoot()` still wins; nothing forces the change.

## Who is affected

- **Applications that override `getProjectRoot()` only to return `__dirname`.** Set `projectRoot: __dirname` where the config is built and delete the override.
- **Everyone else.** No action needed.

## Details

- Reference: [Application](/references/base/application).
