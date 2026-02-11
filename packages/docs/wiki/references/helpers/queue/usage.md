# Usage

## BullMQ Queue

The `BullMQHelper` provides a robust, Redis-backed message queuing system using BullMQ. It can operate as a job producer (`queue` role) or a job consumer (`worker` role).

### Roles

| Role | Purpose | Key Instance Property |
|------|---------|----------------------|
| `queue` | Add jobs (producer) | `queue` (`Queue` from BullMQ) |
| `worker` | Process jobs (consumer) | `worker` (`Worker` from BullMQ) |

### Creating a Worker (Consumer)

```typescript
import { BullMQHelper, RedisHelper } from '@venizia/ignis-helpers';

const redisConnection = new RedisHelper({
  name: 'redis-queue',
  host: 'localhost',
  port: 6379,
  password: 'password',
});

const myWorker = new BullMQHelper({
  queueName: 'my-email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection,
  numberOfWorker: 3,
  onWorkerData: async (job) => {
    console.log(`Sending email to ${job.data.email}`);
    return { status: 'ok' };
  },
  onWorkerDataCompleted: async (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
  },
  onWorkerDataFail: async (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
  },
});
```

> [!IMPORTANT]
> Pass the `DefaultRedisHelper` instance to `redisConnection`, **not** the raw ioredis client. The helper internally calls `redisConnection.getClient().duplicate()` to create dedicated connections for the queue and worker.

### Creating a Queue (Producer)

```typescript
const myQueue = new BullMQHelper({
  queueName: 'my-email-queue',
  identifier: 'email-queue',
  role: 'queue',
  redisConnection,
});

// Add a job to the queue
myQueue.queue.add('send-welcome-email', { email: 'test@example.com' });
```

> [!TIP]
> You can also use the static factory: `BullMQHelper.newInstance({ ... })` which is equivalent to `new BullMQHelper({ ... })`.

### Default Job Options

Jobs added to the queue are created with these defaults:

```typescript
defaultJobOptions: {
  removeOnComplete: true,
  removeOnFail: true,
}
```

::: details IBullMQOptions type definition
```typescript
interface IBullMQOptions<TQueueElement = any, TQueueResult = any> {
  queueName: string;
  identifier: string;
  role: TBullQueueRole;                // 'queue' | 'worker'
  redisConnection: DefaultRedisHelper; // Pass the helper instance, not the raw client

  numberOfWorker?: number;   // Worker concurrency (default: 1)
  lockDuration?: number;     // Lock duration in ms (default: 90 * 60 * 1000 = 90 min)

  onWorkerData?: (job: Job<TQueueElement, TQueueResult>) => Promise<any>;
  onWorkerDataCompleted?: (job: Job<TQueueElement, TQueueResult>, result: any) => Promise<void>;
  onWorkerDataFail?: (
    job: Job<TQueueElement, TQueueResult> | undefined,
    error: Error,
  ) => Promise<void>;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queueName` | `string` | -- | Name of the BullMQ queue |
| `identifier` | `string` | -- | Unique identifier for logging |
| `role` | `TBullQueueRole` | -- | `'queue'` (producer) or `'worker'` (consumer) |
| `redisConnection` | `DefaultRedisHelper` | -- | Redis helper instance |
| `numberOfWorker` | `number` | `1` | Worker concurrency |
| `lockDuration` | `number` | `5400000` | Job lock duration in ms (90 min) |
| `onWorkerData` | `function` | -- | Job processing callback |
| `onWorkerDataCompleted` | `function` | -- | Job completion callback |
| `onWorkerDataFail` | `function` | -- | Job failure callback |
:::

### Redis Cluster Support

When using Redis Cluster with BullMQ, set `maxRetriesPerRequest: null` on the cluster config -- this is **required** by BullMQ.

::: details Redis Cluster example
```typescript
import { Cluster } from 'ioredis';
import { DefaultRedisHelper, BullMQHelper } from '@venizia/ignis-helpers';

const cluster = new Cluster(
  [
    { host: 'node1.redis.example.com', port: 6379 },
    { host: 'node2.redis.example.com', port: 6379 },
    { host: 'node3.redis.example.com', port: 6379 },
  ],
  {
    maxRetriesPerRequest: null,  // Required by BullMQ
    enableReadyCheck: true,
    scaleReads: 'slave',
    redisOptions: {
      password: 'your-password',
      tls: {},
    },
  }
);

const redisHelper = new DefaultRedisHelper({
  scope: 'BullMQ',
  identifier: 'my-redis',
  client: cluster,
});

const helper = BullMQHelper.newInstance({
  queueName: 'my-queue',
  identifier: 'my-worker',
  role: 'worker',
  redisConnection: redisHelper,
  onWorkerData: async (job) => {
    // process job
  },
});
```
:::

## MQTT Queue

The `MQTTClientHelper` provides an interface for interacting with an MQTT broker, allowing you to publish and subscribe to topics for real-time messaging.

### Creating an MQTT Client

```typescript
import { MQTTClientHelper } from '@venizia/ignis-helpers';

const mqttClient = new MQTTClientHelper({
  identifier: 'my-mqtt-client',
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
  onError: (error) => {
    console.error('MQTT error:', error);
  },
});
```

::: details IMQTTClientOptions type definition
```typescript
interface IMQTTClientOptions {
  identifier: string;
  url: string;
  options: mqtt.IClientOptions;  // MQTT client options (username, password, etc.)

  onMessage: (opts: { topic: string; message: Buffer }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onClose?: (error?: Error) => void;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique identifier for logging |
| `url` | `string` | -- | MQTT broker URL (e.g., `mqtt://localhost:1883`) |
| `options` | `mqtt.IClientOptions` | -- | MQTT.js client options |
| `onMessage` | `function` | -- | Message handler (required) |
| `onConnect` | `function` | -- | Connection established callback |
| `onDisconnect` | `function` | -- | Disconnection callback |
| `onError` | `function` | -- | Error callback |
| `onClose` | `function` | -- | Connection closed callback |
:::

### Subscribe and Publish

```typescript
// Subscribe to topics
await mqttClient.subscribe({ topics: ['sensors/temperature', 'sensors/humidity'] });

// Publish a message (string or Buffer)
await mqttClient.publish({ topic: 'sensors/temperature', message: '23.5' });
await mqttClient.publish({ topic: 'sensors/raw', message: Buffer.from([0x01, 0x02]) });
```

> [!NOTE]
> Both `subscribe()` and `publish()` reject with an `ApplicationError` (status 400) if the MQTT client is not connected. Ensure the connection is established before calling these methods.

## In-Memory Queue

The `QueueHelper` provides a generator-based, in-memory queue with a built-in state machine for managing sequential tasks within a single process. It automatically processes enqueued items one at a time.

### State Machine

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
| `QueueStatuses.WAITING` | `'000_WAITING'` | Idle, ready to process next element |
| `QueueStatuses.PROCESSING` | `'100_PROCESSING'` | Currently handling a message |
| `QueueStatuses.LOCKED` | `'200_LOCKED'` | Paused, no new processing until unlocked |
| `QueueStatuses.SETTLED` | `'300_SETTLED'` | Terminal state, no more elements accepted |

### Creating an In-Memory Queue

```typescript
import { QueueHelper } from '@venizia/ignis-helpers';

const myQueue = new QueueHelper<string>({
  identifier: 'my-in-memory-queue',
  onMessage: async ({ identifier, queueElement }) => {
    console.log(`[${identifier}] Processing:`, queueElement.payload);
    await new Promise(resolve => setTimeout(resolve, 1000));
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
  autoDispatch: true, // default: true
});

myQueue.enqueue('message 1');
myQueue.enqueue('message 2');
```

::: details IQueueCallback type definition
```typescript
interface IQueueCallback<TElementPayload> {
  autoDispatch?: boolean; // Auto-process on enqueue (default: true)

  onMessage?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;

  onDataEnqueue?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;

  onDataDequeue?: (opts: {
    identifier: string;
    queueElement: TQueueElement<TElementPayload>;
  }) => ValueOrPromise<void>;

  onStateChange?: (opts: {
    identifier: string;
    from: TQueueStatus;
    to: TQueueStatus;
  }) => ValueOrPromise<void>;
}

// Queue element wrapper
type TQueueElement<T> = { isLocked: boolean; payload: T };
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique identifier for logging |
| `autoDispatch` | `boolean` | `true` | Auto-process on enqueue |
| `onMessage` | `function` | -- | Message processing callback |
| `onDataEnqueue` | `function` | -- | Enqueue notification callback |
| `onDataDequeue` | `function` | -- | Dequeue notification callback |
| `onStateChange` | `function` | -- | State transition callback |
:::

### Lock and Unlock

Use `lock()` / `unlock()` to pause and resume processing without losing queued elements.

```typescript
// Pause the queue (e.g., during maintenance)
myQueue.lock();

// Elements can still be enqueued while locked,
// but they won't be processed until unlocked
myQueue.enqueue('queued-while-locked');

// Resume processing
myQueue.unlock({ shouldProcessNextElement: true });
```

### Settling the Queue

Once settled, the queue rejects new elements and transitions to `SETTLED` after all in-flight work completes.

```typescript
// Signal that no more elements will be added
myQueue.settle();

// Check completion
if (myQueue.isSettled()) {
  console.log('All work done, total events:', myQueue.getTotalEvent());
}

// Or close entirely (settle + terminate generator)
myQueue.close();
```
