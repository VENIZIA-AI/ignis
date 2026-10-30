---
title: WorkerApplication Gains configs.projectRoot; BaseKafkaHelper Turns protected
description: WorkerApplication accepts an optional projectRoot, and three BaseKafkaHelper members become protected so a subclass can extend it.
packages: ['@venizia/ignis-worker', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-07

## Worker project root and an extendable Kafka helper

<Badge type="tip" text="New Feature" />

**In one line.** `WorkerApplication` gets the same `projectRoot` setting `ServerApplication` has, and `BaseKafkaHelper` can be extended instead of forked.

```typescript
export const configs: IWorkerApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  projectRoot: '/srv/app',
};
```

## What changed

- **`configs.projectRoot` on `WorkerApplication`.** `IWorkerApplicationConfigs` extends `IApplicationConfigs` with an optional `projectRoot`. `getProjectRoot()` returns `configs.projectRoot`, then the current directory, then an empty string.
- **No `node_modules` check.** Unlike `ServerApplication`, `WorkerApplication` never warns about a missing `node_modules`, because a browser Worker has no filesystem to check.
- **`ProjectRootRegistry`.** New, reachable from `@venizia/ignis-helpers/core`, with no Node import. `ModuleUtility.setProjectRoot()` and `getProjectRoot()` keep their signatures, so existing callers are unaffected.
- **`BaseKafkaHelper` is extendable.** `connectedBrokers`, `onBrokerConnect` and `onBrokerDisconnect` turn `protected`, matching `KafkaConsumerHelper`.

## Who is affected

- **A worker host built for a non-cwd peer root.** Set `configs.projectRoot`; nothing else changes.
- **Consumers that forked `BaseKafkaHelper` to reach a formerly private member.** Extend the class instead, and delete the fork.
- **Everyone else.** No action needed.

## Details

- `protected` here is an extension seam, not a stable contract between minor versions.
