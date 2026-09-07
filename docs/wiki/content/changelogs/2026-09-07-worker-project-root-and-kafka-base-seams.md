---
title: WorkerApplication Gains configs.projectRoot; BaseKafkaHelper Turns protected
description: IWorkerApplicationConfigs gains an optional projectRoot, and WorkerApplication.getProjectRoot() resolves it the way ServerApplication does, minus the node_modules check a browser Worker cannot make. BaseKafkaHelper's connectedBrokers, onBrokerConnect, and onBrokerDisconnect turn protected, matching KafkaConsumerHelper.
---

# Changelog - 2026-09-07

## WorkerApplication: configs.projectRoot

<Badge type="tip" text="New Feature" />

**In one line.** `WorkerApplication` gets the same `projectRoot` seam `ServerApplication` has - minus the filesystem check a browser Worker cannot make.

```typescript
export const configs: IWorkerApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  projectRoot: '/srv/app',
};
```

### The problem it solves

`WorkerApplication` inherited the kernel's default `getProjectRoot()`, which returns an empty string and never calls `ModuleUtility.setProjectRoot()`. A worker host built for a non-cwd peer root - the same case `configs.projectRoot` solved for `ServerApplication` on 2026-09-06 - had no seam to set it.

## BaseKafkaHelper: protected, not private

<Badge type="tip" text="New Feature" />

**In one line.** `connectedBrokers`, `onBrokerConnect`, and `onBrokerDisconnect` turn `protected`, so a subclass can extend `BaseKafkaHelper` instead of forking it - `KafkaConsumerHelper` made this same change on 2026-09-06.

### The problem it solves

A consumer needed to override broker-connect handling and read the connected-broker set from a subclass. `KafkaConsumerHelper` already made every member `protected` for exactly this; `BaseKafkaHelper` itself still kept three of them `private`.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `IWorkerApplicationConfigs` | New; extends the kernel's `IApplicationConfigs` with an optional `projectRoot` | core-worker |
| `WorkerApplication.getProjectRoot()` | Returns `configs.projectRoot ?? globalThis.process?.cwd?.() ?? ''`; binds `CoreBindings.APPLICATION_PROJECT_ROOT`; shares the value with `ModuleUtility` | core-worker |
| `ProjectRootRegistry` | New; the `globalThis`-slot half of `ModuleUtility.setProjectRoot()`/`getProjectRoot()`, with no Node import, reachable from `@venizia/ignis-helpers/core` | helpers |
| `BaseKafkaHelper` | `connectedBrokers`, `onBrokerConnect`, `onBrokerDisconnect` turn `protected` | helpers |

- Unlike `ServerApplication`, `WorkerApplication` never warns about a missing `node_modules`: a browser Worker has no filesystem to check, and reaching for `node:fs` would bundle a Node builtin straight into it. It also never reads a bare `process.cwd()` - a real browser Worker has no such global - reading it defensively through `globalThis.process?.cwd?.()` instead, which resolves to `''` there.
- `ModuleUtility.setProjectRoot()`/`getProjectRoot()` keep their exact signatures; they now delegate to `ProjectRootRegistry` internally, so every existing caller is unaffected.
- `protected` here is an extension seam, not a stable contract between minor versions.

## Who is affected

- **A worker host built for a non-cwd peer root.** Set `configs.projectRoot`; nothing else changes.
- **Consumers that forked `BaseKafkaHelper` to reach a formerly private member.** Extend the class instead, and delete the fork.
- **Everyone else.** No action needed.
