---
title: BullMQHelper and KafkaConsumerHelper Gain Extension Seams
description: BullMQHelper takes queueOptions and workerOptions, and exposes a protected cluster duck-typing check. KafkaConsumerHelper adds onStreamError and onReconnectError, both falling back to onMessageError, and every member becomes protected instead of private. Two consumers had forked these classes to reach exactly this.
---

# Changelog - 2026-09-06

## Queue helper extension seams

<Badge type="tip" text="New Feature" />

**In one line.** `BullMQHelper` takes `queueOptions`/`workerOptions`; `KafkaConsumerHelper` adds `onStreamError`/`onReconnectError` and turns fully `protected`.

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

## The problem it solves

Two consumers each forked a whole framework class to reach one missing seam. One needed extra BullMQ options passed through to the underlying Queue and Worker.

The other needed to react to a Kafka stream error separately from a per-message error. It also needed to extend a helper whose lifecycle methods were private.

## What changed

| Symbol | Change | Package |
|---|---|---|
| `IBullMQOptions.queueOptions` / `.workerOptions` | New; typed from `bullmq`'s `QueueOptions`/`WorkerOptions`, minus the fields the helper owns | helpers |
| `BullMQHelper.queueOptionsFor()` / `.workerOptionsFor()` | New `protected` methods; merge the framework defaults, then the option, then the owned fields (`connection`, `concurrency`, `lockDuration`) | helpers |
| `BullMQHelper.isClusterClient()` | New `protected` method; duck-types a Redis Cluster client (`instanceof Cluster`, `isCluster`, or a `nodes()` method), so a duplicated or cross-copy client still gets the `{queueName}` hash tag | helpers |
| `IKafkaConsumerOptions.onStreamError` / `.onReconnectError` | New callbacks; each falls back to `onMessageError` when unset | helpers |
| `KafkaConsumerHelper` | Every member is `protected`, not `private` | helpers |

- `onMessageError` keeps its per-message role. A consumer that sets only `onMessageError` sees no behavior change.
- `protected` here is an extension seam, not a stable contract between minor versions.

## Who is affected

- **Consumers that forked `BullMQHelper` or `KafkaConsumerHelper` to reach these seams.** Extend the class, or pass the new options, and delete the fork.
- **Everyone else.** No action needed.
