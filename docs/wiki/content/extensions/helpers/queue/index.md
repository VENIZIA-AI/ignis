---
title: Queue
description: Redis-backed job processing with BullMQ, a single-process in-memory queue, and MQTT pub/sub - three queueing backends behind one helper family
difficulty: intermediate
---

# Queue

The Queue helpers move work between processes. Pick a backend: BullMQ for durable jobs, an in-memory queue for single-process sequencing, or MQTT for lightweight pub/sub.

## In one example

Create a Redis-backed producer and worker with `BullMQHelper`.

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

const redis = new RedisSingleHelper({ name: 'queue-redis', host: 'localhost', port: 6379, password: 'secret' });

const producer = BullMQHelper.newInstance({
  queueName: 'email-queue',
  identifier: 'email-producer',
  role: 'queue',
  redisConnection: redis,
});

await producer.queue.add('send-welcome', { email: 'user@example.com', template: 'welcome' });

const worker = BullMQHelper.newInstance({
  queueName: 'email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection: redis,
  onWorkerData: async job => {
    console.log(`Processing ${job.id}:`, job.data);
    return { status: 'sent' };
  },
});
```

`RedisSingleHelper` sets `maxRetriesPerRequest: null` automatically, so it works with BullMQ out of the box - no extra Redis configuration needed for this example.

## How it works

- **Three backends, one family.** `BullMQHelper`, `SequentialQueueHelper`, and `MQTTClientHelper` all live under `@venizia/ignis-helpers`. A fourth backend, Kafka, is documented separately - see [Kafka Helpers](/extensions/helpers/kafka/).

| Backend | Class | Peer dependency | Reach for it when |
|---------|-------|------------------|--------------------|
| BullMQ | `BullMQHelper` | `bullmq` | Jobs must survive a process restart or run across multiple workers |
| In-memory | `SequentialQueueHelper` | none | Sequential, single-process work that does not need persistence |
| MQTT | `MQTTClientHelper` | `mqtt` | Pub/sub for IoT and lightweight real-time events, not job processing |

- **`BullMQHelper` takes one `role` per instance, fixed at construction.**

| `role` | Property | Use |
|---|---|---|
| `'queue'` | `.queue` (BullMQ `Queue`) | Producers call `.add()` |
| `'worker'` | `.worker` (BullMQ `Worker`) | Driven by your `onWorkerData` callback |

- **One Redis helper backs any number of queues and workers.** The helper always calls `redisConnection.duplicateClient()` to open a dedicated connection for whichever role it owns. It never reuses your client directly.
- **`SequentialQueueHelper` runs one element at a time**, in a `WAITING -> PROCESSING -> WAITING` loop driven by `onMessage`. Two calls change that loop:

| Call | Effect |
|---|---|
| `lock()` | Pauses processing at `LOCKED`. Elements still enqueue; nothing processes until `unlock()`. |
| `settle()` / `close()` | Drains the queue, then moves to the terminal `SETTLED` state. |

Full option tables, the complete state machine, and `HfQueueHelper` (the low-level FIFO primitive underneath) are in the [Full reference](/extensions/helpers/queue/reference).

## Common tasks

### Enqueue a job from a producer

```typescript
await producer.queue.add('send-reset', { email: 'user@example.com', token: 'abc123' });
```

Jobs default to `removeOnComplete: true, removeOnFail: true` - BullMQ does not retain job records after they finish.

### Process jobs with a worker

`numberOfWorker` sets concurrency. `onWorkerDataFail` receives the job (possibly `undefined`) and the error.

```typescript
const worker = BullMQHelper.newInstance({
  queueName: 'email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection: redis,
  numberOfWorker: 3,
  onWorkerData: async job => {
    await sendEmail(job.data.email);
    return { status: 'sent' };
  },
  onWorkerDataFail: async (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
  },
});
```

### The Redis connection requirement

Pass an `IRedisHelper` instance, not a raw ioredis client. `BullMQHelper` calls `redisConnection.duplicateClient()` internally.

| Redis helper | Sets `maxRetriesPerRequest: null`? |
|--------------|-------------------------------------|
| `RedisSingleHelper` | Automatically |
| `RedisSentinelHelper` | Automatically |
| `RedisClusterHelper` | No - set it yourself, BullMQ requires it |

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

const clusterRedis = new RedisClusterHelper({
  name: 'cluster-redis',
  nodes: [{ host: 'node1.redis.example.com', port: 6379 }],
  clusterOptions: {
    redisOptions: { maxRetriesPerRequest: null }, // required by BullMQ
  },
});
```

### In-memory queue for single-process sequencing

```typescript
import { SequentialQueueHelper } from '@venizia/ignis-helpers';

const queue = new SequentialQueueHelper<{ task: string }>({
  identifier: 'task-processor',
  onMessage: async ({ queueElement }) => {
    await performTask(queueElement.payload);
  },
});

await queue.enqueue({ task: 'resize-image' });
```

### MQTT publish and subscribe

```typescript
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';

const client = new MQTTClientHelper({
  identifier: 'sensor-client',
  url: 'mqtt://localhost:1883',
  options: {},
  onConnect: () => client.subscribe({ topics: ['sensors/temperature'] }),
  onMessage: ({ topic, message }) => console.log(topic, message.toString()),
});

await client.publish({ topic: 'sensors/temperature', message: '23.5' });
```

## See also

- [Full reference](/extensions/helpers/queue/reference) - every option table, method signature, and the in-memory state machine in full
- [Redis Helper](/extensions/helpers/redis/) - `BullMQHelper`'s connection backend
- [Kafka Helpers](/extensions/helpers/kafka/) - the fourth queueing backend, documented separately

**Files:**

- [`packages/helpers/src/modules/queue/bullmq/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/bullmq/helper.ts) - `BullMQHelper`
- [`packages/helpers/src/modules/queue/internal/sequential/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/internal/sequential/helper.ts) - `SequentialQueueHelper`
- [`packages/helpers/src/modules/queue/mqtt/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/mqtt/helper.ts) - `MQTTClientHelper`
