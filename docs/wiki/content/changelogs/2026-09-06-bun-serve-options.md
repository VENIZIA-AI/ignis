---
title: configs.server Passes idleTimeout and maxRequestBodySize to Bun.serve
description: IServerApplicationConfigs gains a server group with idleTimeout and maxRequestBodySize, so you no longer copy startBunModule to change one Bun.serve option.
packages: ['@venizia/ignis']
---

# Changelog - 2026-09-06

## `configs.server` - Bun.serve options without re-implementing `startBunModule`

<Badge type="tip" text="New Feature" />

**In one line.** Two `Bun.serve` options an application has a reason to change now live in the application config; nothing else about the socket changes.

## What changed

- **`IServerApplicationConfigs.server`** is a new optional group: `{ idleTimeout?: number; maxRequestBodySize?: number }`, typed by the new `IServerRuntimeConfigs`.
- **`idleTimeout`** is in seconds and Bun caps it at 255. **`maxRequestBodySize`** is in bytes.
- **Unset keys keep Bun's defaults.** A key set to `undefined` behaves like one left out.
- **Other `Bun.serve` options.** Override `ServerApplication.getServerRuntimeOptions()` and extend the object it returns.
- **Node runtime.** `startNodeModule()` logs one warning naming the ignored keys and ignores the group.

```typescript
export const configs: IServerApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  server: {
    idleTimeout: 60,
    maxRequestBodySize: 50 * 1024 * 1024,
  },
};
```

## Who is affected

- **Applications that override `startBunModule()` to change one option.** Delete the override and set the option under `configs.server`. The override still compiles, but the copy misses later fixes to the start path.
- **Applications on the node runtime.** Nothing changes. If you set `configs.server` there, the boot log carries one warning and the values are ignored.
- **Everyone else.** No action needed.

## Details

- Reference: [Application](/references/base/application).
