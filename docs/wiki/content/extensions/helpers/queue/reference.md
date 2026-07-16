---
title: Queue - Full Reference
description: Complete reference for BullMQHelper, SequentialQueueHelper, HfQueueHelper, and MQTTClientHelper - every option, method, and state transition
difficulty: intermediate
---

# Queue - Full Reference

Exhaustive reference for the Queue helper family. For a readable introduction and the most common tasks, start with the [Queue overview](/extensions/helpers/queue/).

**Files:**

- [`packages/helpers/src/modules/queue/bullmq/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/bullmq/helper.ts) - `BullMQHelper`
- [`packages/helpers/src/modules/queue/internal/sequential/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/internal/sequential/helper.ts) - `SequentialQueueHelper`
- [`packages/helpers/src/modules/queue/internal/sequential/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/internal/sequential/types.ts) - `QueueStatuses`, `TQueueStatus`, `TQueueElement`, `IQueueCallback`
- [`packages/helpers/src/modules/queue/internal/hf/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/internal/hf/helper.ts) - `HfQueueHelper`
- [`packages/helpers/src/modules/queue/mqtt/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/mqtt/helper.ts) - `MQTTClientHelper`
- [`packages/helpers/src/modules/queue/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/common/types.ts) - `TBullQueueRole`

## Class Overview

| Class | Extends | Peer dependency | Use case |
|-------|---------|------------------|----------|
| `BullMQHelper` | `BaseHelper` | `bullmq` | Redis-backed job queue - durable, multi-worker background processing |
| `SequentialQueueHelper` (alias `QueueHelper`) | `BaseHelper` | none | Single-process, in-memory, one-at-a-time sequencing |
| `HfQueueHelper` | `BaseHelper` | none | Generic O(1) FIFO primitive - single-threaded, no callbacks, no persistence |
| `MQTTClientHelper` | `BaseHelper` | `mqtt` | MQTT broker pub/sub - IoT and lightweight real-time events |

Kafka (`KafkaProducerHelper`, `KafkaConsumerHelper`, `KafkaAdminHelper`, `KafkaSchemaRegistryHelper`) is a fourth backend under the same `queue/` module tree but is documented on its own page - see [Kafka Helpers](/extensions/helpers/kafka/).

## Import Paths

`BullMQHelper` and `MQTTClientHelper` live behind sub-path exports so their peer dependencies (`bullmq`, `mqtt`) never become hard dependencies of the base package. `SequentialQueueHelper`, `QueueHelper`, `QueueStatuses`, `HfQueueHelper`, and `TBullQueueRole` ship from the root package.

```typescript
// Root package - no peer dependency
import { SequentialQueueHelper, QueueHelper, QueueStatuses, HfQueueHelper } from '@venizia/ignis-helpers';
import type { TQueueStatus, TQueueElement, IQueueCallback, IHfQueueNode, TBullQueueRole } from '@venizia/ignis-helpers';

// BullMQ - sub-path export
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

// MQTT - sub-path export
import { MQTTClientHelper, type IMQTTClientOptions } from '@venizia/ignis-helpers/mqtt';
```

## BullMQHelper

`Source ->` [`packages/helpers/src/modules/queue/bullmq/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/bullmq/helper.ts)

### Constructor

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

const worker = new BullMQHelper({
  queueName: 'email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection: redisHelper,
  numberOfWorker: 3,
  lockDuration: 10 * 60 * 1000,
  onWorkerData: async job => {
    console.log(`Processing job ${job.id}:`, job.data);
    return { status: 'sent' };
  },
  onWorkerDataCompleted: async (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
  },
  onWorkerDataFail: async (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
  },
});
```

`BullMQHelper.newInstance(opts)` is a static factory equivalent to `new BullMQHelper(opts)`.

### IBullMQOptions

`IBullMQOptions<TQueueElement = any, TQueueResult = any>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queueName` | `string` | - | BullMQ queue name. Must be non-empty. |
| `identifier` | `string` | - | Scoped-logging identifier. |
| `role` | `TBullQueueRole` (`'queue' \| 'worker'`) | - | `'queue'` initializes a producer; `'worker'` initializes a consumer. |
| `redisConnection` | `IRedisHelper` | - | Connection backend. The helper calls `duplicateClient()` on it - never a raw ioredis client. |
| `numberOfWorker` | `number` | `1` | Worker concurrency (BullMQ `Worker` `concurrency` option). Ignored for `role: 'queue'`. |
| `lockDuration` | `number` | `5400000` (90 minutes) | Job lock duration in milliseconds. Ignored for `role: 'queue'`. |
| `onWorkerData` | `(job: Job<TQueueElement, TQueueResult>) => Promise<any>` | - | Job processor. If omitted, the worker logs `id`, `name`, `data` at info level and resolves `undefined`. |
| `onWorkerDataCompleted` | `(job, result) => Promise<void>` | - | Fired on the BullMQ `Worker` `'completed'` event. |
| `onWorkerDataFail` | `(job \| undefined, error: Error) => Promise<void>` | - | Fired on the BullMQ `Worker` `'failed'` event. `job` may be `undefined`. |

> [!IMPORTANT]
> Pass an `IRedisHelper` instance to `redisConnection`, **not** the raw ioredis client. `BullMQHelper` calls `redisConnection.duplicateClient()` internally to get a dedicated connection per role - one shared Redis helper can back any number of queues and workers.

### Configuration lifecycle

The constructor calls `configure()`, which switches on `role`:

| `role` | Method called | Result |
|--------|---------------|--------|
| `'queue'` | `configureQueue()` | Builds `this.queue` (BullMQ `Queue`); attaches an `'error'` listener |
| `'worker'` | `configureWorker()` | Builds `this.worker` (BullMQ `Worker`); attaches `'completed'`, `'failed'`, `'error'` listeners |
| missing / other | neither | Logs `'Invalid client role to configure'` and returns - **does not throw** |

`configureQueue()` and `configureWorker()` each guard on `queueName`: if it is falsy, the method logs `'Invalid queue name'` / `'Invalid worker name'` and returns without constructing anything - `this.queue` / `this.worker` stay `undefined`. Neither path throws; a misconfigured helper fails later, when you call `.queue.add(...)` or `.worker` on the `undefined` property.

> [!NOTE]
> An `'error'` event with no listener is re-thrown by Node's `EventEmitter` and crashes the process. `BullMQHelper` always attaches an `'error'` listener to both `queue` and `worker` so a transient Redis error is logged instead of taking the process down.

`onWorkerDataCompleted` and `onWorkerDataFail` run through an internal hook wrapper that absorbs both synchronous throws and rejected promises, logging them instead of propagating - a broken callback cannot crash the worker or block the next job.

### Cluster queue name wrapping

- **Detects cluster mode.** `resolveQueueName()` checks whether `redisConnection.getClient()` is an ioredis `Cluster` instance.
- **Wraps the name in a hash-tag.** When the connection is a cluster and `queueName` does not already start with `{`, the name is wrapped: `email-queue` becomes `{email-queue}`.
- **Why.** This forces BullMQ's queue keys onto a single cluster slot, which BullMQ requires for cluster mode. You do not need to wrap the name yourself.

### Default job options

Every job added via `queue.add()` is created with:

```typescript
defaultJobOptions: {
  removeOnComplete: true,
  removeOnFail: true,
}
```

BullMQ does not retain job records after they finish (success or failure).

### Redis Cluster setup

`RedisClusterHelper` does not set `maxRetriesPerRequest: null` automatically - set it inside `clusterOptions.redisOptions` yourself, since BullMQ requires it:

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

const redisHelper = new RedisClusterHelper({
  name: 'cluster-redis',
  nodes: [
    { host: 'node1.redis.example.com', port: 6379 },
    { host: 'node2.redis.example.com', port: 6379 },
    { host: 'node3.redis.example.com', port: 6379 },
  ],
  clusterOptions: {
    enableReadyCheck: true,
    scaleReads: 'slave',
    redisOptions: {
      password: 'your-password',
      tls: {},
      maxRetriesPerRequest: null, // required by BullMQ
    },
  },
});

const worker = BullMQHelper.newInstance({
  queueName: 'my-queue',
  identifier: 'cluster-worker',
  role: 'worker',
  redisConnection: redisHelper,
  onWorkerData: async job => {
    // process job
  },
});
```

### close()

```typescript
await producer.close();
await consumer.close();
```

Calls `worker?.close()` then `queue?.close()` in sequence - both run even if the first fails, so a failing worker close never leaks the queue's Redis connection. If either fails, `close()` throws a single `ApplicationError` aggregating both failure messages after both close attempts have run.

### API summary

| Member | Returns | Description |
|--------|---------|--------------|
| `static newInstance(opts)` | `BullMQHelper` | Factory, equivalent to `new BullMQHelper(opts)`. |
| `configure()` | `void` | Dispatches to `configureQueue()` or `configureWorker()` based on `role`. Called automatically by the constructor. |
| `configureQueue()` | `void` | Builds the BullMQ `Queue`. |
| `configureWorker()` | `void` | Builds the BullMQ `Worker`. |
| `close()` | `Promise<void>` | Gracefully closes worker and queue connections. |
| `queue` | `Queue<TQueueElement, TQueueResult>` | Present when `role: 'queue'`. |
| `worker` | `Worker<TQueueElement, TQueueResult>` | Present when `role: 'worker'`. |

## SequentialQueueHelper

`Source ->` [`packages/helpers/src/modules/queue/internal/sequential/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/internal/sequential/helper.ts)

> [!NOTE]
> `QueueHelper` is a deprecated alias for `SequentialQueueHelper`, kept for backward compatibility. Prefer `SequentialQueueHelper` in new code.

A generator-driven, in-memory queue that processes one element at a time within a single process - no Redis, no persistence.

### Constructor

```typescript
import { SequentialQueueHelper } from '@venizia/ignis-helpers';

const queue = new SequentialQueueHelper<string>({
  identifier: 'task-queue',
  autoDispatch: true,
  onMessage: async ({ identifier, queueElement }) => {
    console.log(`[${identifier}] Processing:`, queueElement.payload);
  },
  onDataEnqueue: async ({ identifier, queueElement }) => {
    console.log(`[${identifier}] Enqueued:`, queueElement.payload);
  },
  onDataDequeue: async ({ identifier, queueElement }) => {
    console.log(`[${identifier}] Dequeued:`, queueElement.payload);
  },
  onStateChange: async ({ identifier, from, to }) => {
    console.log(`[${identifier}] State: ${from} -> ${to}`);
  },
});
```

### IQueueCallback

`IQueueCallback<TElementPayload>`, constructed together with `identifier: string`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoDispatch` | `boolean` | `true` | When `true`, `enqueue()` automatically calls `nextMessage()`. |
| `onMessage` | `(opts: { identifier: string; queueElement: TQueueElement<T> }) => ValueOrPromise<void>` | - | Message processor. If omitted, the internal generator logs a warning and never initializes - nothing is ever processed. |
| `onDataEnqueue` | `(opts: { identifier: string; queueElement: TQueueElement<T> }) => ValueOrPromise<void>` | - | Fired after an element is pushed onto `storage`. |
| `onDataDequeue` | `(opts: { identifier: string; queueElement: TQueueElement<T> }) => ValueOrPromise<void>` | - | Fired after an element is shifted off `storage`. |
| `onStateChange` | `(opts: { identifier: string; from: TQueueStatus; to: TQueueStatus }) => ValueOrPromise<void>` | - | Fired on every state transition. |

All four hooks run through an internal wrapper that absorbs synchronous throws and promise rejections, logging them instead - a broken callback cannot break the state machine.

### TQueueElement

```typescript
type TQueueElement<T> = { isLocked: boolean; payload: T };
```

`isLocked` marks whether the head element is currently being handed to `onMessage`; it is distinct from the queue-level `lock()`/`unlock()` state below.

### QueueStatuses and the state machine

```
WAITING ──enqueue──> PROCESSING ──done──> WAITING
   │                     │
   └──lock()──> LOCKED <─┘
                  │
              unlock()──> WAITING
                  │
              settle()──> SETTLED (terminal)
```

| State | Value | Description |
|-------|-------|-------------|
| `QueueStatuses.WAITING` | `'000_WAITING'` | Idle, ready to process the next element. |
| `QueueStatuses.PROCESSING` | `'100_PROCESSING'` | Currently running `onMessage` for the head element. |
| `QueueStatuses.LOCKED` | `'200_LOCKED'` | Paused. Elements can still be enqueued; nothing processes until `unlock()`. |
| `QueueStatuses.SETTLED` | `'300_SETTLED'` | Terminal. No further elements accepted. |

- **Why numeric prefixes.** `'000_...'` .. `'300_...'` make `state >= QueueStatuses.LOCKED` and `state > QueueStatuses.LOCKED` valid string comparisons - `lock()` and `unlock()` use exactly that to guard against re-entering from an invalid state.
- **Validate an arbitrary string** with `QueueStatuses.isValid(value)`.

### Processing loop

Internally, `_messageListener()` is a generator that loops `while (true) { yield this.handleMessage(); }`. `nextMessage()` calls `generator.next()` only when `state === WAITING`; any other state logs a warning and returns without advancing. `handleMessage()`:

1. Reads the head element (`getElementAt(0)`); returns early if empty or already `isLocked`.
2. Transitions `WAITING -> PROCESSING` (skipped if already `LOCKED`/`SETTLED`).
3. Marks the head `isLocked = true`, adds it to `processingEvents`, and awaits `onMessage`.
4. Dequeues the completed element and removes it from `processingEvents`.
5. Transitions back to `WAITING` (skipped if `LOCKED`/`SETTLED`).
6. If `storage` is now empty and `settle()` was requested, transitions to `SETTLED`; otherwise calls `nextMessage()` again to continue the loop.

A failing `onMessage` handler is logged and swallowed by the same hook wrapper described above - the element is still dequeued and the loop continues. `onMessage` owns its own retry policy; the queue itself never retries.

### Methods

| Method | Returns | Description |
|--------|---------|--------------|
| `enqueue(payload)` | `Promise<void>` | Pushes an element onto `storage`. No-ops (logs an error) if `state === SETTLED` or settle was requested. No-ops silently if `payload` is falsy. Calls `nextMessage()` when `autoDispatch` is `true`. |
| `dequeue()` | `TQueueElement<T> \| undefined` | Shifts the head element off `storage` and fires `onDataDequeue`. |
| `nextMessage()` | `void` | Advances the generator. Only effective when `state === WAITING`; otherwise logs a warning and returns. |
| `lock()` | `void` | Transitions to `LOCKED`. No-ops (logs an error) if already `LOCKED` or `SETTLED`. |
| `unlock(opts)` | `void` | `opts: { shouldProcessNextElement?: boolean }` (default `true`). Transitions to `WAITING`; no-ops (logs an error) if `state > LOCKED` (i.e. already `SETTLED`). Calls `nextMessage()` unless `shouldProcessNextElement: false`. |
| `settle()` | `void` | Sets the settle flag. Transitions immediately to `SETTLED` unless currently `PROCESSING`, in which case `handleMessage()` finishes the transition once `storage` empties. |
| `isSettled()` | `boolean` | `true` when `state === SETTLED` and `storage` is empty. |
| `close()` | `void` | Calls `settle()`, then terminates the generator via `generator.return(...)`. |
| `getElementAt(position)` | `TQueueElement<T>` | Peek at an element by index (`storage[position]`). |
| `getState()` | `TQueueStatus` | Current state. |
| `getTotalEvent()` | `number` | Total elements ever enqueued (monotonic counter, not decremented on dequeue). |
| `getProcessingEvents()` | `Set<TQueueElement<T>>` | The element(s) currently mid-`onMessage`. |

> [!NOTE]
> Once `SETTLED`, `enqueue()` permanently rejects new elements - there is no way to reopen a settled queue. Construct a new `SequentialQueueHelper` instance instead.

## HfQueueHelper

`Source ->` [`packages/helpers/src/modules/queue/internal/hf/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/internal/hf/helper.ts)

- **O(1) FIFO, not a job queue.** A generic, high-frequency, single-consumer primitive for enqueue, dequeue, and cancel - backed by an array plus a moving head index (no `Array.shift()`, which is O(n)).
- **No callbacks, no state machine, not thread-safe.** It is the low-level queue the pool helper's waiter list is built on, not a job-processing API.
- **Reach for `SequentialQueueHelper` instead** unless you specifically need a bare FIFO with cancellable entries.

```typescript
import { HfQueueHelper } from '@venizia/ignis-helpers';

const queue = new HfQueueHelper<{ task: string }>({ scope: 'my-waiter-queue' });

const node = queue.enqueue({ value: { task: 'resize-image' } });
queue.cancel({ node }); // O(1) removal without scanning

const next = queue.dequeue(); // null when empty
const remaining = queue.drain(); // remove + return every live value, emptying the queue
```

| Member | Returns | Description |
|--------|---------|--------------|
| constructor | - | `opts?: { scope?: string }` - unlike other queue helpers, this takes `scope`, not `identifier`. |
| `size` | `number` (getter) | Count of live (enqueued, not yet dequeued or cancelled) entries. |
| `enqueue(opts)` | `IHfQueueNode<T>` | `opts: { value: T }`. Appends and returns a node handle. |
| `dequeue()` | `T \| null` | Removes and returns the next live value in FIFO order, skipping cancelled nodes. `null` when empty. |
| `cancel(opts)` | `void` | `opts: { node: IHfQueueNode<T> }`. Marks a queued node cancelled; idempotent. |
| `drain()` | `T[]` | Removes and returns every remaining live value in FIFO order, emptying the queue. |

Consumed entries are compacted out of the backing array once the consumed prefix exceeds 256 entries and covers at least half the array, keeping every operation amortized O(1).

## MQTTClientHelper

`Source ->` [`packages/helpers/src/modules/queue/mqtt/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/mqtt/helper.ts)

### Constructor

```typescript
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';

const client = new MQTTClientHelper({
  identifier: 'iot-gateway',
  url: 'mqtt://broker.example.com:1883',
  options: { keepalive: 60 },
  onConnect: () => {
    client.subscribe({ topics: ['devices/+/status'] });
  },
  onMessage: ({ topic, message }) => {
    console.log(topic, message.toString());
  },
  onDisconnect: () => console.log('Disconnected'),
  onError: error => console.error('Connection error:', error.message),
  onClose: error => {
    if (error) console.error('Connection closed with error:', error);
  },
});
```

The constructor calls `configure()` automatically, which connects via `mqtt.connect(url, options)`. Calling `configure()` again on an already-connected client is a no-op (logs and returns).

### IMQTTClientOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | - | Scoped-logging identifier. |
| `url` | `string` | - | MQTT broker URL. Must be non-empty - throws an `ApplicationError` (status 500) if empty. |
| `options` | `mqtt.IClientOptions` | - | MQTT.js client options (username, password, keepalive, ...). |
| `onMessage` | `(opts: { topic: string; message: Buffer }) => void` | - | Required. Message handler for all subscribed topics. |
| `onConnect` | `() => void` | - | Fired on the `'connect'` event. |
| `onDisconnect` | `() => void` | - | Fired on the `'disconnect'` event. |
| `onError` | `(error: Error) => void` | - | Fired on the `'error'` event. |
| `onClose` | `(error?: Error) => void` | - | Fired on the `'close'` event. |

> [!NOTE]
> At connect time, `MQTTClientHelper` logs the broker `url` through `redactUrlCredentials()` and `options` through `redactSecrets()`. A password embedded in the URL (`mqtts://user:hunter2@broker:8883`) never reaches the log - only `mqtts://user:[REDACTED]@broker:8883` does.

### Methods

| Method | Returns | Description |
|--------|---------|--------------|
| `configure()` | `void` | Connects to the broker and wires `connect`/`disconnect`/`message`/`error`/`close` listeners. Called automatically by the constructor; a no-op if already connected. |
| `getClient()` | `mqtt.MqttClient \| undefined` | The underlying MQTT.js client. |
| `subscribe(opts)` | `Promise<string[]>` | `opts: { topics: string[] }`. Rejects with an `ApplicationError` (status 400) if the client is not connected. |
| `publish(opts)` | `Promise<{ topic, message }>` | `opts: { topic: string; message: string \| Buffer }`. Rejects with an `ApplicationError` (status 400) if the client is not connected. |
| `close(opts?)` | `Promise<void>` | `opts?: { isForce?: boolean }` (default `false`). Ends the client via `client.end(isForce, undefined, callback)`, resolving once the driver reports the connection ended. Safe to call more than once. |

## Troubleshooting

### "Invalid queue name" / "Invalid worker name"

**Cause:** `queueName` is empty when `BullMQHelper` configures a queue or worker. This is a **logged error, not a thrown exception** - `this.queue` / `this.worker` are simply never assigned.

**Fix:** Provide a non-empty `queueName`:

```typescript
// Wrong - this.queue stays undefined, calling .queue.add(...) throws later
new BullMQHelper({ queueName: '', role: 'queue', identifier: 'x', redisConnection: redis });

// Correct
new BullMQHelper({ queueName: 'my-email-queue', role: 'queue', identifier: 'x', redisConnection: redis });
```

### "Invalid client role to configure"

**Cause:** `role` is missing or not one of `'queue'` / `'worker'`. Logged, not thrown.

**Fix:**

```typescript
new BullMQHelper({ role: 'worker', queueName: 'q', identifier: 'x', redisConnection: redis, /* ... */ });
```

### "Invalid url to configure mqtt client!"

**Cause:** `url` is empty when constructing `MQTTClientHelper`. **This one throws** an `ApplicationError` (status 500).

**Fix:**

```typescript
new MQTTClientHelper({ url: 'mqtt://localhost:1883', identifier: 'x', options: {}, onMessage: () => {} });
```

### "MQTT Client is not available to subscribe topic!" / "... to publish message!"

**Cause:** `subscribe()` or `publish()` called before the client finished connecting, or after it disconnected. Rejects with an `ApplicationError` (status 400).

**Fix:** Call `subscribe()`/`publish()` from inside `onConnect`, or check `client.getClient()?.connected` first.

### Elements not processing in `SequentialQueueHelper`

**Checklist:**
- `onMessage` must be provided - without it, the generator never initializes and nothing is ever processed.
- Check `getState()` - a `LOCKED` queue accepts `enqueue()` but never processes; call `unlock({ shouldProcessNextElement: true })`.
- Check `autoDispatch` - if `false`, call `nextMessage()` manually after each `enqueue()`.
- Check `isSettled()` - a settled queue rejects new elements; construct a new instance.

## Import Reference

```typescript
import {
  SequentialQueueHelper,
  QueueHelper, // deprecated alias for SequentialQueueHelper
  QueueStatuses,
  HfQueueHelper,
} from '@venizia/ignis-helpers';

import type {
  TQueueStatus,
  TQueueElement,
  IQueueCallback,
  IHfQueueNode,
  TBullQueueRole,
} from '@venizia/ignis-helpers';

import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';
import type { IMQTTClientOptions } from '@venizia/ignis-helpers/mqtt';
```

## See also

- [Queue overview](/extensions/helpers/queue/) - introduction and the most common tasks
- [Redis Helper - Full Reference](/extensions/helpers/redis/reference) - `IRedisHelper`, `duplicateClient()`, and the `maxRetriesPerRequest` defaults per topology
- [Kafka Helpers](/extensions/helpers/kafka/) - the fourth queueing backend
- [BullMQ documentation](https://docs.bullmq.io/) - underlying job queue library
- [MQTT.js](https://github.com/mqttjs/MQTT.js) - underlying MQTT client library
