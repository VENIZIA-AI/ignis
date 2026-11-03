---
title: BullMQHelper and KafkaConsumerHelper Gain Extension Seams
description: BullMQHelper takes queueOptions and workerOptions, KafkaConsumerHelper adds onStreamError and onReconnectError, and its members become protected, so you extend the class instead of forking it.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-06

## Queue helper extension seams

<Badge type="tip" text="New Feature" />

**In one line.** `BullMQHelper` takes `queueOptions` and `workerOptions`; `KafkaConsumerHelper` adds `onStreamError` and `onReconnectError` and turns fully `protected`.

## What changed

- **`IBullMQOptions.queueOptions` and `.workerOptions`** pass extra BullMQ `QueueOptions` and `WorkerOptions` through, minus the fields the helper owns (`connection`, `concurrency`, `lockDuration`).
- **`BullMQHelper.queueOptionsFor()` and `.workerOptionsFor()`** are new `protected` methods. They merge the framework defaults, then your option, then the owned fields.
- **`BullMQHelper.isClusterClient()`** is a new `protected` method that duck-types a Redis Cluster client (`instanceof Cluster`, `isCluster`, or a `nodes()` method), so a duplicated or cross-copy client still gets the `{queueName}` hash tag.
- **`IKafkaConsumerOptions.onStreamError` and `.onReconnectError`** are new callbacks. Each falls back to `onMessageError` when unset, so a consumer that sets only `onMessageError` sees no change.
- **`KafkaConsumerHelper`** members are `protected`, not `private`. This is an extension seam, not a stable contract between minor versions.

```typescript
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

new BullMQHelper({
  queueName: 'mail',
  identifier: 'mail-worker',
  role: 'worker',
  redisConnection,
  workerOptions: { autorun: false },
});
```

## Who is affected

- **Consumers that forked `BullMQHelper` or `KafkaConsumerHelper`.** Extend the class, or pass the new options, and delete the fork.
- **Everyone else.** No action needed.
