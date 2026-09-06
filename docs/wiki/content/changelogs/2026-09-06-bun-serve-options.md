---
title: configs.server Passes idleTimeout and maxRequestBodySize to Bun.serve
description: IServerApplicationConfigs gains a server group with idleTimeout and maxRequestBodySize; startBunModule spreads it into Bun.serve, unset keys keep Bun's defaults, and the node runtime warns and ignores the group. An application that copied startBunModule to change one option deletes the copy.
---

# Changelog - 2026-09-06

## `configs.server` - Bun.serve options without re-implementing `startBunModule`

<Badge type="tip" text="New Feature" />

**In one line.** Two `Bun.serve` options an application has a reason to change now live in the application config; nothing else about the socket changes.

```typescript
export const configs: IServerApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  server: {
    idleTimeout: 60,
    maxRequestBodySize: 50 * 1024 * 1024,
  },
};
```

## The problem it solves

`startBunModule()` called `Bun.serve` with the port, the host and the fetch handler and nothing else. An application that needed a longer idle timeout, for a request that streams a large import, had one option: override `startBunModule()` and copy its forty lines to add one. That copy froze at the framework version of the day and stopped receiving every later fix to the start path.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `IServerApplicationConfigs.server` | New optional group: `{ idleTimeout?: number; maxRequestBodySize?: number }` | core-server |
| `IServerRuntimeConfigs` | New exported interface for that group | core-server |
| `ServerApplication.getServerRuntimeOptions()` | New protected method; returns `configs.server` with unset keys dropped | core-server |
| `ServerApplication.startBunModule()` | Spreads `getServerRuntimeOptions()` into `Bun.serve` | core-server |
| `ServerApplication.startNodeModule()` | Logs one warning naming the ignored keys when the group is set | core-server |

- `idleTimeout` is in seconds and Bun caps it at 255. `maxRequestBodySize` is in bytes.
- An unset key is not passed at all, so Bun's own default applies. Setting a key to `undefined` behaves like leaving it out.
- The group lives on the core-server config type, not the kernel's: the kernel is browser-pure and carries no `Bun.serve` types.
- To pass any other `Bun.serve` option, override `getServerRuntimeOptions()` and extend the returned object. The start path itself stays the framework's.

## Who is affected

- **Applications that override `startBunModule()` to change one option.** Delete the override and set the option under `configs.server`. The override still compiles, so nothing forces the change, but the copy keeps missing framework fixes until it goes.
- **Applications on the node runtime.** Nothing changes. If you set `configs.server` there, the boot log carries one warning and the values are ignored.
- **Everyone else.** No action needed.

## Details

- Reference: [Application](/references/base/application). Concept: `packages/core-server` in the knowledge bundle.
