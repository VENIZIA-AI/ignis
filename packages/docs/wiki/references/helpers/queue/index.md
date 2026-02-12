# Queue

Message queuing and asynchronous task management with BullMQ, MQTT, Kafka, and in-memory solutions.

## Quick Reference

| Class | Extends | Peer Dependency | Use Case |
|-------|---------|-----------------|----------|
| **BullMQHelper** | `BaseHelper` | `bullmq` (^5.63.1) | Redis-backed job queue -- background processing, task scheduling |
| **MQTTClientHelper** | `BaseHelper` | `mqtt` (^5.14.1) | MQTT broker messaging -- real-time events, IoT |
| **KafkaHelper** | `BaseHelper` | `kafkajs` (^2.2.4) | Kafka producer/consumer -- event streaming, high throughput |
| **QueueHelper** | `BaseHelper` | None | In-memory generator queue -- sequential tasks, single process |

#### Common Operations

| Helper | Subscribe / Consume | Publish / Produce |
|--------|---------------------|-------------------|
| **BullMQ** | Create with `role: 'worker'` | `queue.add(name, data)` via the exposed BullMQ `Queue` instance |
| **MQTT** | `subscribe({ topics })` | `publish({ topic, message })` |
| **Kafka** | `runConsumer()` | `sendMessages({ topic, messages })` |
| **In-Memory** | `new QueueHelper({ onMessage })` | `enqueue(payload)` |

#### Import Paths

```typescript
// In-memory queue (from base package)
import { QueueHelper, QueueStatuses } from '@venizia/ignis-helpers';
import type { TQueueStatus, TQueueElement } from '@venizia/ignis-helpers';

// BullMQ (separate export path)
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import type { TBullQueueRole } from '@venizia/ignis-helpers/bullmq';

// MQTT (separate export path)
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';
import type { IMQTTClientOptions } from '@venizia/ignis-helpers/mqtt';

// Kafka (separate export path)
import { KafkaConsumerHelper, KafkaProducerHelper, KafkaAdminHelper, KafkaHelperRoles } from '@venizia/ignis-helpers';
```

## Creating an Instance

All queue helpers extend `BaseHelper`, providing scoped logging via `this.logger`.

### BullMQHelper

The `BullMQHelper` wraps the BullMQ library for Redis-backed job queuing. It operates in one of two roles: `'queue'` (producer) or `'worker'` (consumer). The role is set at construction time and determines which BullMQ primitives are initialized.

```typescript
import { DefaultRedisHelper } from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

const worker = new BullMQHelper({
  queueName: 'email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection: redisHelper,
  numberOfWorker: 3,
  lockDuration: 90 * 60 * 1000,
  onWorkerData: async (job) => {
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

#### IBullMQOptions

`IBullMQOptions<TQueueElement = any, TQueueResult = any>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queueName` | `string` | -- | Name of the BullMQ queue. Must be non-empty. |
| `identifier` | `string` | -- | Unique identifier used for scoped logging. |
| `role` | `TBullQueueRole` | -- | `'queue'` (producer) or `'worker'` (consumer). |
| `redisConnection` | `DefaultRedisHelper` | -- | Redis helper instance. The helper calls `getClient().duplicate()` internally. |
| `numberOfWorker` | `number` | `1` | Worker concurrency (number of jobs processed in parallel). |
| `lockDuration` | `number` | `5400000` | Job lock duration in milliseconds (default: 90 minutes). |
| `onWorkerData` | `(job: Job<TQueueElement, TQueueResult>) => Promise<any>` | `undefined` | Job processing callback. If omitted, the worker logs job details. |
| `onWorkerDataCompleted` | `(job: Job<TQueueElement, TQueueResult>, result: any) => Promise<void>` | `undefined` | Callback fired when a job completes successfully. |
| `onWorkerDataFail` | `(job: Job<TQueueElement, TQueueResult> \| undefined, error: Error) => Promise<void>` | `undefined` | Callback fired when a job fails. |

> [!IMPORTANT]
> Pass the `DefaultRedisHelper` instance to `redisConnection`, **not** the raw ioredis client. The helper internally calls `redisConnection.getClient().duplicate()` to create dedicated connections for the queue and worker.

### MQTTClientHelper

The `MQTTClientHelper` provides a pub/sub interface to an MQTT broker. The client connects automatically during construction.

```typescript
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';

const mqttClient = new MQTTClientHelper({
  identifier: 'sensor-client',
  url: 'mqtt://localhost:1883',
  options: {
    username: 'user',
    password: 'password',
  },
  onMessage: ({ topic, message }) => {
    console.log(`Received on ${topic}:`, message.toString());
  },
  onConnect: () => {
    console.log('Connected to MQTT broker');
  },
  onDisconnect: () => {
    console.log('Disconnected from MQTT broker');
  },
  onError: (error) => {
    console.error('MQTT error:', error);
  },
  onClose: (error) => {
    if (error) console.error('Connection closed with error:', error);
  },
});
```

#### IMQTTClientOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique identifier for scoped logging. |
| `url` | `string` | -- | MQTT broker URL (e.g., `mqtt://localhost:1883`). Must be non-empty. |
| `options` | `mqtt.IClientOptions` | -- | MQTT.js client options (username, password, keepalive, etc.). |
| `onMessage` | `(opts: { topic: string; message: Buffer }) => void` | -- | Message handler. Required. |
| `onConnect` | `() => void` | `undefined` | Callback fired when the client connects to the broker. |
| `onDisconnect` | `() => void` | `undefined` | Callback fired on disconnection. |
| `onError` | `(error: Error) => void` | `undefined` | Callback fired on client errors. |
| `onClose` | `(error?: Error) => void` | `undefined` | Callback fired when the connection is closed. |

### KafkaHelper

The `KafkaHelper` suite provides producer, consumer, and admin implementations using `kafkajs`.

#### KafkaConsumerHelper

Manages message consumption, offset management, and batch processing.

```typescript
import { KafkaConsumerHelper, KafkaHelperRoles } from '@venizia/ignis-helpers';
import { Kafka } from 'kafkajs';

const kafka = new Kafka({ clientId: 'my-app', brokers: ['localhost:9092'] });

const consumer = new KafkaConsumerHelper({
  kafka,
  identifier: 'user-events-consumer',
  role: KafkaHelperRoles.ROLE_CONSUMER,
  consumerConfig: { groupId: 'user-service-group' },
  autoCommit: true,
  onMessage: async ({ topic, partition, message }) => {
    console.log({ topic, value: message.value?.toString() });
  },
});
```

#### KafkaProducerHelper

Handles message publishing with automatic serialization.

```typescript
import { KafkaProducerHelper, KafkaHelperRoles } from '@venizia/ignis-helpers';

const producer = new KafkaProducerHelper({
  kafka,
  identifier: 'user-events-producer',
  role: KafkaHelperRoles.ROLE_PRODUCER,
  producerConfig: { allowAutoTopicCreation: true },
});
```

### QueueHelper

The `QueueHelper` is a generator-based, in-memory queue with a built-in state machine. It processes enqueued items one at a time, making it suitable for sequential task processing within a single process.

```typescript
import { QueueHelper } from '@venizia/ignis-helpers';

const queue = new QueueHelper<string>({
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

#### IQueueCallback

`IQueueCallback<TElementPayload>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique identifier for scoped logging. |
| `autoDispatch` | `boolean` | `true` | If `true`, automatically triggers processing when an element is enqueued. |
| `onMessage` | `(opts: { identifier: string; queueElement: TQueueElement<T> }) => ValueOrPromise<void>` | `undefined` | Message processing callback. If omitted, the generator exits immediately. |
| `onDataEnqueue` | `(opts: { identifier: string; queueElement: TQueueElement<T> }) => ValueOrPromise<void>` | `undefined` | Callback fired after an element is added to the queue. |
| `onDataDequeue` | `(opts: { identifier: string; queueElement: TQueueElement<T> }) => ValueOrPromise<void>` | `undefined` | Callback fired after an element is removed from the queue. |
| `onStateChange` | `(opts: { identifier: string; from: TQueueStatus; to: TQueueStatus }) => ValueOrPromise<void>` | `undefined` | Callback fired on every state transition. |

#### TQueueElement

Each element in the queue is wrapped in a `TQueueElement`:

```typescript
type TQueueElement<T> = { isLocked: boolean; payload: T };
```

## Usage

### BullMQ -- Adding Jobs

When created with `role: 'queue'`, the helper exposes a `queue` property (a BullMQ `Queue` instance) for adding jobs.

```typescript
const producer = new BullMQHelper({
  queueName: 'email-queue',
  identifier: 'email-producer',
  role: 'queue',
  redisConnection: redisHelper,
});

// Add a job via the BullMQ Queue API
await producer.queue.add('send-welcome', { email: 'user@example.com', template: 'welcome' });
await producer.queue.add('send-reset', { email: 'user@example.com', token: 'abc123' });
```

> [!TIP]
> You can also use the static factory method: `BullMQHelper.newInstance({ ... })` which is equivalent to `new BullMQHelper({ ... })`.

#### Default Job Options

Jobs are created with these defaults:

```typescript
defaultJobOptions: {
  removeOnComplete: true,
  removeOnFail: true,
}
```

### BullMQ -- Processing Jobs

When created with `role: 'worker'`, the helper initializes a BullMQ `Worker` that listens for jobs on the specified queue.

```typescript
const consumer = new BullMQHelper<{ email: string }, { status: string }>({
  queueName: 'email-queue',
  identifier: 'email-consumer',
  role: 'worker',
  redisConnection: redisHelper,
  numberOfWorker: 3,
  lockDuration: 10 * 60 * 1000, // 10 minutes
  onWorkerData: async (job) => {
    await sendEmail(job.data.email);
    return { status: 'sent' };
  },
  onWorkerDataCompleted: async (job, result) => {
    console.log(`Job ${job.id} done:`, result);
  },
  onWorkerDataFail: async (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
  },
});
```

If `onWorkerData` is not provided, the worker logs the job's `id`, `name`, and `data` at the info level.

### BullMQ -- Redis Cluster

When using Redis Cluster with BullMQ, you must set `maxRetriesPerRequest: null` on the cluster config -- this is **required** by BullMQ.

```typescript
import { Cluster } from 'ioredis';
import { DefaultRedisHelper } from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';

const cluster = new Cluster(
  [
    { host: 'node1.redis.example.com', port: 6379 },
    // ...
  ],
  {
    maxRetriesPerRequest: null,  // Required by BullMQ
    // ...
  }
);

const redisHelper = new DefaultRedisHelper({
  scope: 'BullMQ',
  identifier: 'cluster-redis',
  client: cluster,
});

const worker = BullMQHelper.newInstance({
  queueName: 'my-queue',
  identifier: 'cluster-worker',
  role: 'worker',
  redisConnection: redisHelper,
  onWorkerData: async (job) => { /* ... */ },
});
```

### BullMQ -- Graceful Shutdown

Call `close()` to gracefully shut down both the worker and queue connections.

```typescript
await producer.close();
await consumer.close();
```

`close()` calls `worker.close()` and `queue.close()` in sequence. If closing fails, it logs the error and re-throws.

### MQTT -- Subscribe and Publish

After the client connects to the broker, use `subscribe()` and `publish()` for topic-based messaging.

```typescript
// Subscribe to multiple topics
await mqttClient.subscribe({ topics: ['sensors/temperature', 'sensors/humidity'] });

// Publish a string message
await mqttClient.publish({ topic: 'sensors/temperature', message: '23.5' });

// Publish a Buffer message
await mqttClient.publish({ topic: 'sensors/raw', message: Buffer.from([0x01, 0x02]) });
```

> [!NOTE]
> Both `subscribe()` and `publish()` reject with an `ApplicationError` (status 400) if the MQTT client is not connected. Ensure the connection is established before calling these methods.

### MQTT -- Event Handling

The `MQTTClientHelper` calls `configure()` automatically during construction. Once connected, the `onMessage` callback receives messages for all subscribed topics.

```typescript
const client = new MQTTClientHelper({
  identifier: 'iot-gateway',
  url: 'mqtt://broker.example.com:1883',
  options: { keepalive: 60 },
  onConnect: () => {
    // Subscribe once connected
    client.subscribe({ topics: ['devices/+/status'] });
  },
  onMessage: ({ topic, message }) => {
    const deviceId = topic.split('/')[1];
    console.log(`Device ${deviceId}:`, message.toString());
  },
  onError: (error) => {
    console.error('Connection error:', error.message);
  },
  onClose: () => {
    console.log('Connection closed');
  },
});
```

### Kafka -- Producer Usage

```typescript
await producer.connectProducer();

// Send single/multiple messages to a topic
await producer.sendMessages({
  topic: 'user.created',
  messages: [
    { key: 'user-1', value: { id: 1, name: 'Alice' } },
    { key: 'user-2', value: { id: 2, name: 'Bob' } },
  ],
});
```

### Kafka -- Consumer Usage

```typescript
await consumer.connectConsumer();
await consumer.subscribeToTopics(['user.created', 'user.updated']);

// Start processing
await consumer.runConsumer();
```

> [!NOTE]
> You must implement either `onMessage` or `onBatch`. If `autoCommit` is false (recommended), you should manually commit offsets using `commitOffsets()` if you are managing flow control manually, though `consumer.run` handles commit for `onMessage` automatically if successful.

### Kafka -- Admin Usage

```typescript
import { KafkaAdminHelper, KafkaHelperRoles } from '@venizia/ignis-helpers';

const admin = new KafkaAdminHelper({
  kafka,
  identifier: 'cluster-admin',
  role: KafkaHelperRoles.ROLE_ADMIN,
});

await admin.connectAdmin();

// Create a new topic
await admin.createTopics({
  topics: [{
    topic: 'new-topic',
    numPartitions: 3,
    replicationFactor: 1
  }],
});

// List all topics
const topics = await admin.listTopics();
console.log(topics);

await admin.disconnectAdmin();
```

### In-Memory Queue -- Enqueueing and Processing

With `autoDispatch: true` (default), elements are processed automatically as they are enqueued.

```typescript
import { QueueHelper } from '@venizia/ignis-helpers';

const queue = new QueueHelper<{ task: string; priority: number }>({
  identifier: 'task-processor',
  onMessage: async ({ queueElement }) => {
    console.log('Processing:', queueElement.payload.task);
    await performTask(queueElement.payload);
  },
});

// Elements are processed one at a time, in order
await queue.enqueue({ task: 'resize-image', priority: 1 });
await queue.enqueue({ task: 'send-notification', priority: 2 });
```

#### Manual Dispatch

Set `autoDispatch: false` to control when processing begins. Call `nextMessage()` to trigger processing of the next element.

```typescript
const queue = new QueueHelper<string>({
  identifier: 'manual-queue',
  autoDispatch: false,
  onMessage: async ({ queueElement }) => {
    console.log('Processing:', queueElement.payload);
  },
});

await queue.enqueue('item-1');
await queue.enqueue('item-2');

// Nothing processed yet -- trigger manually
queue.nextMessage(); // processes 'item-1'
```

> [!NOTE]
> `nextMessage()` only triggers processing when the queue state is `WAITING`. It logs a warning and returns if the queue is in any other state.

### In-Memory Queue -- State Machine

The `QueueHelper` uses a state machine to manage its lifecycle:

```
WAITING ──enqueue──> PROCESSING ──done──> WAITING
   |                     |
   └──lock()──> LOCKED <─┘
                  |
              unlock()──> WAITING
                  |
              settle()──> SETTLED (terminal)
```

| State | Value | Description |
|-------|-------|-------------|
| `QueueStatuses.WAITING` | `'000_WAITING'` | Idle, ready to process the next element. |
| `QueueStatuses.PROCESSING` | `'100_PROCESSING'` | Currently handling a message via `onMessage`. |
| `QueueStatuses.LOCKED` | `'200_LOCKED'` | Paused. No new processing until `unlock()` is called. |
| `QueueStatuses.SETTLED` | `'300_SETTLED'` | Terminal state. No more elements accepted. |

You can validate a state string with `QueueStatuses.isValid(state)`.

### In-Memory Queue -- Lock and Unlock

Use `lock()` / `unlock()` to pause and resume processing without losing queued elements.

```typescript
// Pause the queue (e.g., during maintenance)
queue.lock();

// Elements can still be enqueued while locked,
// but they won't be processed until unlocked
await queue.enqueue('queued-while-locked');

// Resume processing
queue.unlock({ shouldProcessNextElement: true });

// Resume without processing the next element
queue.unlock({ shouldProcessNextElement: false });
```

`lock()` logs an error and returns if the queue is already `LOCKED` or `SETTLED`.

`unlock()` logs an error and returns if the queue is `SETTLED` (past `LOCKED` state).

### In-Memory Queue -- Settling and Closing

Once settled, the queue rejects new elements and transitions to `SETTLED` after all in-flight work completes.

```typescript
// Signal that no more elements will be added
queue.settle();

// Check if the queue is settled and empty
if (queue.isSettled()) {
  console.log('All work done, total events:', queue.getTotalEvent());
}

// Or close entirely (settle + terminate generator)
queue.close();
```

`settle()` sets `isSettleRequested` to `true`. If the queue is not currently processing, it immediately transitions to `SETTLED`. If processing, it transitions to `SETTLED` after the current message completes and the storage is empty.

`close()` calls `settle()` and then terminates the internal generator via `generator.return()`.

## API Summary

### BullMQHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `static newInstance(opts)` | `BullMQHelper` | Factory method, equivalent to `new BullMQHelper(opts)`. |
| `configureQueue()` | `void` | Sets up the BullMQ `Queue` instance. Called automatically for `role: 'queue'`. |
| `configureWorker()` | `void` | Sets up the BullMQ `Worker` instance. Called automatically for `role: 'worker'`. |
| `configure()` | `void` | Delegates to `configureQueue()` or `configureWorker()` based on the `role`. |
| `close()` | `Promise<void>` | Gracefully closes the worker and queue connections. |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `queue` | `Queue<TQueueElement, TQueueResult>` | BullMQ `Queue` instance (available when `role: 'queue'`). |
| `worker` | `Worker<TQueueElement, TQueueResult>` | BullMQ `Worker` instance (available when `role: 'worker'`). |

### MQTTClientHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `configure()` | `void` | Connects to the MQTT broker. Called automatically by the constructor. |
| `subscribe(opts)` | `Promise<string[]>` | Subscribe to one or more topics. `opts: { topics: string[] }` |
| `publish(opts)` | `Promise<{ topic, message }>` | Publish a message to a topic. `opts: { topic: string; message: string \| Buffer }` |

### KafkaHelper

**Consumer (`KafkaConsumerHelper`):**

| Method | Returns | Description |
|--------|---------|-------------|
| `connectConsumer()` | `Promise<void>` | Connect to the Kafka broker |
| `subscribeToTopics(topics)` | `Promise<void>` | Subscribe to one or more topics |
| `runConsumer()` | `Promise<void>` | Start the consumer loop (calls `onMessage` or `onBatch`) |
| `pauseConsumer(topics)` | `void` | Pause consumption for specific topics/partitions |
| `resumeConsumer(topics)` | `void` | Resume consumption for specific topics/partitions |
| `seek(topic, partition, offset)` | `void` | Seek to a specific offset |
| `commitOffsets(offsets)` | `Promise<void>` | Manually commit offsets |
| `disconnectConsumer()` | `Promise<void>` | Disconnect and close the consumer |

**Producer (`KafkaProducerHelper`):**

| Method | Returns | Description |
|--------|---------|-------------|
| `connectProducer()` | `Promise<void>` | Connect producer to the broker |
| `sendMessages(record)` | `Promise<RecordMetadata[]>` | Send messages to a topic |
| `sendBatch(batch)` | `Promise<RecordMetadata[]>` | Send a batch of messages to multiple topics |
| `disconnectProducer()` | `Promise<void>` | Disconnect the producer |

**Admin (`KafkaAdminHelper`):**

| Method | Returns | Description |
|--------|---------|-------------|
| `createTopics(opts)` | `Promise<boolean>` | Create new topics |
| `deleteTopics(opts)` | `Promise<void>` | Delete topics |
| `createPartitions(opts)` | `Promise<void>` | Increase partition count for topics |
| `listTopics()` | `Promise<string[]>` | List all topic names |
| `fetchTopicMetadata(opts)` | `Promise<ITopicMetadata[]>` | Get metadata for topics |
| `fetchTopicOffsets(topic)` | `Promise<Array>` | Get high/low watermarks for a topic |
| `listGroups()` | `Promise<Array>` | List all consumer groups |
| `describeGroups(groupIds)` | `Promise<GroupDescriptions>` | Get consumer group details |
| `resetOffsets(opts)` | `Promise<void>` | Reset consumer group offsets |

### QueueHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `enqueue(payload)` | `Promise<void>` | Add an element to the queue. Rejected if settled. |
| `dequeue()` | `TQueueElement<T> \| undefined` | Remove and return the first element. |
| `nextMessage()` | `void` | Manually trigger processing of the next element. Only works in `WAITING` state. |
| `lock()` | `void` | Pause processing. State becomes `LOCKED`. |
| `unlock(opts)` | `void` | Resume processing. `opts: { shouldProcessNextElement?: boolean }` (default: `true`). |
| `settle()` | `void` | Mark queue as settled. No new elements accepted after this. |
| `isSettled()` | `boolean` | Returns `true` if state is `SETTLED` and storage is empty. |
| `close()` | `void` | Settle the queue and terminate the internal generator. |
| `getElementAt(position)` | `TQueueElement<T>` | Peek at an element by index. |
| `getState()` | `TQueueStatus` | Returns the current queue state. |
| `getTotalEvent()` | `number` | Returns the total number of elements ever enqueued. |
| `getProcessingEvents()` | `Set<TQueueElement<T>>` | Returns the set of currently processing elements. |

## Troubleshooting

### "Invalid queue name"

**Cause:** The `queueName` option is empty or falsy when creating a BullMQ queue or worker.

**Fix:** Provide a non-empty `queueName`:

```typescript
// Wrong
new BullMQHelper({ queueName: '', role: 'queue', ... });

// Correct
new BullMQHelper({ queueName: 'my-email-queue', role: 'queue', ... });
```

### "Invalid client role to configure"

**Cause:** The `role` option is missing or not one of `'queue'` / `'worker'`.

**Fix:** Set `role` to either `'queue'` or `'worker'`:

```typescript
// Wrong
new BullMQHelper({ role: undefined as any, ... });

// Correct
new BullMQHelper({ role: 'worker', ... });
```

### "Invalid url to configure mqtt client!"

**Cause:** The `url` option is empty when constructing an `MQTTClientHelper`. Throws an `ApplicationError` with status 500.

**Fix:** Pass a valid MQTT broker URL:

```typescript
// Wrong
new MQTTClientHelper({ url: '', ... });

// Correct
new MQTTClientHelper({ url: 'mqtt://localhost:1883', ... });
```

### "MQTT Client is not available to subscribe topic!" / "MQTT Client is not available to publish message!"

**Cause:** `subscribe()` or `publish()` was called before the MQTT client finished connecting, or after the client disconnected. Throws an `ApplicationError` with status 400.

**Fix:** Wait for the `onConnect` callback before subscribing or publishing, or verify the client is connected:

```typescript
const client = new MQTTClientHelper({
  identifier: 'my-client',
  url: 'mqtt://localhost:1883',
  options: {},
  onConnect: () => {
    // Safe to subscribe/publish here
    client.subscribe({ topics: ['my/topic'] });
  },
  onMessage: ({ topic, message }) => { /* ... */ },
});
```

### Elements not processing in In-Memory Queue

**Cause:** Multiple possible reasons why `onMessage` is never called.

**Checklist:**
- Verify `onMessage` callback is provided -- the generator logs a warning and exits if missing
- Check if the queue is locked -- call `unlock({ shouldProcessNextElement: true })` to resume
- Check if `autoDispatch` is `false` -- call `nextMessage()` manually after each `enqueue()`
- Check if the queue is settled -- a settled queue rejects new elements; create a new `QueueHelper` instance

### "Queue was SETTLED | No more element acceptable"

**Cause:** `enqueue()` was called after `settle()` or `close()`.

**Fix:** Create a new `QueueHelper` instance if you need to continue processing:

```typescript
queue.close();

// Start a new queue for further work
const newQueue = new QueueHelper<string>({
  identifier: 'task-queue-v2',
  onMessage: async ({ queueElement }) => { /* ... */ },
});
```

## See Also

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers
  - [Cron Helper](../cron/) -- Scheduled tasks with cron expressions
  - [Redis Helper](../redis/) -- Redis connection management (required for BullMQ)

- **External Resources:**
  - [BullMQ Documentation](https://docs.bullmq.io/) -- BullMQ queue library
  - [MQTT.js](https://github.com/mqttjs/MQTT.js) -- MQTT client library
  - [KafkaJS](https://kafka.js.org/) -- Kafka client library
