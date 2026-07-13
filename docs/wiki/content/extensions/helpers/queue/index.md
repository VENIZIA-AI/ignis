# Queue

Message queuing and asynchronous task management with BullMQ, Kafka, MQTT, and in-memory solutions.

## Quick Reference

| Class | Extends | Peer Dependency | Use Case |
|-------|---------|-----------------|----------|
| **BullMQHelper** | `BaseHelper` | `bullmq` (^5.70.0) | Redis-backed job queue -- background processing, task scheduling |
| **KafkaProducerHelper** | `BaseKafkaHelper` | `@platformatic/kafka` (^1.30.0) | Kafka message producer with transaction support |
| **KafkaConsumerHelper** | `BaseKafkaHelper` | `@platformatic/kafka` (^1.30.0) | Kafka message consumer with lag monitoring |
| **KafkaAdminHelper** | `BaseKafkaHelper` | `@platformatic/kafka` (^1.30.0) | Kafka admin operations (topic management) |
| **KafkaSchemaRegistryHelper** | `BaseHelper` | `@platformatic/kafka` (^1.30.0) | Confluent Schema Registry integration |
| **MQTTClientHelper** | `BaseHelper` | `mqtt` (^5.15.0) | MQTT broker messaging -- real-time events, IoT |
| **QueueHelper** | `BaseHelper` | None | In-memory generator queue -- sequential tasks, single process |

#### Common Operations

| Helper | Subscribe / Consume | Publish / Produce |
|--------|---------------------|-------------------|
| **BullMQ** | Create with `role: 'worker'` | `queue.add(name, data)` via the exposed BullMQ `Queue` instance |
| **Kafka** | `consumer.start({ topics })` | `producer.getProducer().send({ messages })` |
| **MQTT** | `subscribe({ topics })` | `publish({ topic, message })` |
| **In-Memory** | `new QueueHelper({ onMessage })` | `enqueue(payload)` |

#### Import Paths

```typescript
// In-memory queue (from base package)
import { QueueHelper, QueueStatuses } from '@venizia/ignis-helpers';
import type { TQueueStatus, TQueueElement } from '@venizia/ignis-helpers';

// BullMQ (separate export path)
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import type { TBullQueueRole } from '@venizia/ignis-helpers/bullmq';

// Kafka (separate export path)
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
  KafkaAdminHelper,
  KafkaSchemaRegistryHelper,
  BaseKafkaHelper,
} from '@venizia/ignis-helpers/kafka';
import type {
  IKafkaProducerOptions,
  IKafkaConsumerOptions,
  IKafkaAdminOptions,
  IKafkaSchemaRegistryOptions,
  IKafkaConsumeStartOptions,
  IKafkaTransactionContext,
  TKafkaBrokerEventCallback,
  TKafkaMessageCallback,
  TKafkaMessageDoneCallback,
  TKafkaMessageErrorCallback,
  TKafkaGroupJoinCallback,
  TKafkaGroupLeaveCallback,
  TKafkaGroupRebalanceCallback,
  TKafkaHeartbeatErrorCallback,
  TKafkaLagCallback,
  TKafkaLagErrorCallback,
} from '@venizia/ignis-helpers/kafka';

// MQTT (separate export path)
import { MQTTClientHelper } from '@venizia/ignis-helpers/mqtt';
import type { IMQTTClientOptions } from '@venizia/ignis-helpers/mqtt';
```

## Creating an Instance

All queue helpers extend `BaseHelper` (Kafka helpers via `BaseKafkaHelper`), providing scoped logging via `this.logger`.

### BullMQHelper

The `BullMQHelper` wraps the BullMQ library for Redis-backed job queuing. It operates in one of two roles: `'queue'` (producer) or `'worker'` (consumer). The role is set at construction time and determines which BullMQ primitives are initialized.

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';
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
| `redisConnection` | `IRedisHelper` | -- | Redis helper instance. The helper calls `duplicateClient()` internally. |
| `numberOfWorker` | `number` | `1` | Worker concurrency (number of jobs processed in parallel). |
| `lockDuration` | `number` | `5400000` | Job lock duration in milliseconds (default: 90 minutes). |
| `onWorkerData` | `(job: Job<TQueueElement, TQueueResult>) => Promise<any>` | `undefined` | Job processing callback. If omitted, the worker logs job details. |
| `onWorkerDataCompleted` | `(job: Job<TQueueElement, TQueueResult>, result: any) => Promise<void>` | `undefined` | Callback fired when a job completes successfully. |
| `onWorkerDataFail` | `(job: Job<TQueueElement, TQueueResult> \| undefined, error: Error) => Promise<void>` | `undefined` | Callback fired when a job fails. |

> [!IMPORTANT]
> Pass an `IRedisHelper` instance to `redisConnection`, **not** the raw ioredis client. The helper internally calls `redisConnection.duplicateClient()` to create dedicated connections for the queue and worker.

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

> [!NOTE]
> At connect time, `MQTTClientHelper` logs the broker `url` through `redactUrlCredentials()` and the `options` object through `redactSecrets()`. If `url` embeds a password (e.g. `mqtts://user:hunter2@broker:8883`), the password never reaches the log -- only `mqtts://user:[REDACTED]@broker:8883` does.

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

### Kafka Producer

The `KafkaProducerHelper` wraps `@platformatic/kafka` Producer with lifecycle management, health tracking, and transaction support.

```typescript
import { KafkaProducerHelper } from '@venizia/ignis-helpers/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-producer',
  acks: -1,
  idempotent: true,
  onBrokerConnect: ({ broker }) => {
    console.log(`Connected to ${broker.host}:${broker.port}`);
  },
  onBrokerDisconnect: ({ broker }) => {
    console.log(`Disconnected from ${broker.host}:${broker.port}`);
  },
});
```

#### IKafkaProducerOptions

`IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>` extends `IKafkaConnectionOptions`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses. |
| `clientId` | `string` | -- | Client identifier. |
| `identifier` | `string` | `'kafka-producer'` | Scoped logging identifier. |
| `acks` | `0 \| 1 \| -1` | -- | Acknowledgment mode. `0` = none, `1` = leader, `-1` = all ISR. |
| `idempotent` | `boolean` | -- | Enable idempotent producer. |
| `transactionalId` | `string` | -- | Transactional ID (required for transactions with `idempotent: true`). |
| `compression` | `CompressionAlgorithmValue` | -- | Message compression algorithm. |
| `strict` | `boolean` | `true` | Strict mode for topic validation. |
| `autocreateTopics` | `boolean` | `false` | Auto-create topics on send. |
| `retries` | `number` | `3` | Number of retries on failure. |
| `retryDelay` | `number` | `1000` | Delay between retries in milliseconds. |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in milliseconds. |
| `serializers` | `Partial<Serializers<...>>` | -- | Custom key/value/header serializers. |
| `registry` | `SchemaRegistry<...>` | -- | Schema registry for serialization. |
| `sasl` | `SASLOptions` | -- | SASL authentication options. |
| `tls` | `TLSOptions` | -- | TLS connection options. |
| `ssl` | `SSLOptions` | -- | SSL connection options. |
| `connectTimeout` | `number` | -- | Connection timeout in milliseconds. |
| `requestTimeout` | `number` | -- | Request timeout in milliseconds. |
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | -- | Callback when a broker connects. |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | -- | Callback when a broker disconnects. |

### Kafka Consumer

The `KafkaConsumerHelper` wraps `@platformatic/kafka` Consumer with message processing callbacks, consumer group lifecycle events, and lag monitoring.

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-consumer',
  groupId: 'my-consumer-group',
  onMessage: async ({ message }) => {
    console.log('Received:', message.value);
    await message.commit();
  },
  onMessageError: ({ error }) => {
    console.error('Error:', error);
  },
  onGroupJoin: ({ groupId, memberId }) => {
    console.log(`Joined ${groupId} as ${memberId}`);
  },
});
```

#### IKafkaConsumerOptions

`IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>` extends `IKafkaConnectionOptions`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses. |
| `clientId` | `string` | -- | Client identifier. |
| `groupId` | `string` | -- | Consumer group ID. Required. |
| `identifier` | `string` | `'kafka-consumer'` | Scoped logging identifier. |
| `groupProtocol` | `'classic' \| 'consumer'` | `'classic'` | Consumer group protocol. |
| `groupInstanceId` | `string` | -- | Static group membership instance ID. |
| `autocommit` | `boolean \| number` | `false` | Auto-commit offsets. `false` = manual, `true` or number = interval. |
| `sessionTimeout` | `number` | `30000` | Session timeout in milliseconds. |
| `heartbeatInterval` | `number` | `3000` | Heartbeat interval in milliseconds. |
| `rebalanceTimeout` | `number` | `sessionTimeout` | Rebalance timeout in milliseconds. |
| `highWaterMark` | `number` | `1024` | Stream high water mark. |
| `minBytes` | `number` | `1` | Minimum bytes to fetch per request. |
| `maxBytes` | `number` | -- | Maximum bytes to fetch per request. |
| `maxWaitTime` | `number` | -- | Maximum wait time for fetch in milliseconds. |
| `metadataMaxAge` | `number` | `300000` | Metadata cache max age in milliseconds. |
| `retries` | `number` | `3` | Number of retries on failure. |
| `retryDelay` | `number` | `1000` | Delay between retries in milliseconds. |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in milliseconds. |
| `deserializers` | `Partial<Deserializers<...>>` | -- | Custom key/value/header deserializers. |
| `registry` | `SchemaRegistry<...>` | -- | Schema registry for deserialization. |
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | -- | Callback when a broker connects. |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | -- | Callback when a broker disconnects. |
| `onMessage` | `TKafkaMessageCallback` | -- | Message processing callback. |
| `onMessageDone` | `TKafkaMessageDoneCallback` | -- | Callback after message processing completes. |
| `onMessageError` | `TKafkaMessageErrorCallback` | -- | Callback on message processing error. |
| `onGroupJoin` | `TKafkaGroupJoinCallback` | -- | Callback when consumer joins the group. |
| `onGroupLeave` | `TKafkaGroupLeaveCallback` | -- | Callback when consumer leaves the group. |
| `onGroupRebalance` | `TKafkaGroupRebalanceCallback` | -- | Callback on group rebalance. |
| `onHeartbeatError` | `TKafkaHeartbeatErrorCallback` | -- | Callback on heartbeat error. |
| `onLag` | `TKafkaLagCallback` | -- | Callback with lag offset data. |
| `onLagError` | `TKafkaLagErrorCallback` | -- | Callback on lag monitoring error. |

### Kafka Admin

The `KafkaAdminHelper` wraps `@platformatic/kafka` Admin for topic and cluster management.

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

const admin = KafkaAdminHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-admin',
  onBrokerConnect: ({ broker }) => {
    console.log(`Connected to ${broker.host}:${broker.port}`);
  },
});

// Access the full Admin API directly
const adminClient = admin.getAdmin();
await adminClient.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
```

#### IKafkaAdminOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses. |
| `clientId` | `string` | -- | Client identifier. |
| `identifier` | `string` | `'kafka-admin'` | Scoped logging identifier. |
| `retries` | `number` | `3` | Number of retries on failure. |
| `retryDelay` | `number` | `1000` | Delay between retries in milliseconds. |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in milliseconds. |
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | -- | Callback when a broker connects. |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | -- | Callback when a broker disconnects. |

### Kafka Schema Registry

The `KafkaSchemaRegistryHelper` wraps `@platformatic/kafka` ConfluentSchemaRegistry for Avro/Protobuf/JSON schema integration with producer and consumer helpers.

```typescript
import { KafkaSchemaRegistryHelper, KafkaProducerHelper } from '@venizia/ignis-helpers/kafka';

const schemaRegistry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
});

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-producer',
  registry: schemaRegistry.getRegistry(),
});
```

#### IKafkaSchemaRegistryOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | -- | Schema Registry URL. |
| `identifier` | `string` | `'kafka-schema-registry'` | Scoped logging identifier. |
| `auth` | `object` | -- | Authentication credentials. |
| `protobufTypeMapper` | `function` | -- | Protobuf type mapping function. |
| `jsonValidateSend` | `boolean` | -- | Validate JSON schemas on send. |

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

When using Redis Cluster with BullMQ, use `RedisClusterHelper`. Set `maxRetriesPerRequest: null` inside `clusterOptions.redisOptions` -- this is **required** by BullMQ.

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
      maxRetriesPerRequest: null,  // Required by BullMQ
    },
  },
});

const worker = BullMQHelper.newInstance({
  queueName: 'my-queue',
  identifier: 'cluster-worker',
  role: 'worker',
  redisConnection: redisHelper,
  onWorkerData: async (job) => {
    // process job
  },
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

### Kafka -- Producing Messages

Use `getProducer()` to access the underlying `@platformatic/kafka` Producer and send messages.

```typescript
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-producer',
  acks: -1,
});

// Send messages via the underlying producer
await producer.getProducer().send({
  messages: [
    { topic: 'orders', key: 'order-1', value: JSON.stringify({ item: 'widget' }) },
  ],
});

// Health check
producer.isHealthy(); // true when connected to a broker
```

### Kafka -- Consuming Messages

Call `start()` to begin consuming from topics. Messages are delivered via the `onMessage` callback.

```typescript
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  onMessage: async ({ message }) => {
    console.log('Key:', message.key, 'Value:', message.value);
    await message.commit();
  },
  onMessageDone: async ({ message }) => {
    console.log('Processing complete for offset:', message.offset);
  },
  onMessageError: ({ error, message }) => {
    console.error('Processing failed:', error.message);
  },
});

await consumer.start({
  topics: ['orders'],
  mode: 'committed',          // Default: 'committed'
  fallbackMode: 'latest',     // Default: 'latest'
});
```

#### IKafkaConsumeStartOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `topics` | `string[]` | -- | Topics to consume from. |
| `mode` | `MessagesStreamModeValue` | `'committed'` | Consume mode. |
| `fallbackMode` | `MessagesStreamFallbackModeValue` | `'latest'` | Fallback mode when no committed offset exists. |

### Kafka -- Lag Monitoring

Monitor consumer lag to detect processing delays.

```typescript
consumer.startLagMonitoring({
  topics: ['orders'],
  interval: 30_000, // Default: 30 seconds
});

// Stop monitoring
consumer.stopLagMonitoring();
```

Use the `onLag` and `onLagError` callbacks to react to lag data:

```typescript
const consumer = KafkaConsumerHelper.newInstance({
  // ...
  onLag: ({ lag }) => {
    console.log('Current lag offsets:', lag);
  },
  onLagError: ({ error }) => {
    console.error('Lag monitoring error:', error);
  },
});
```

### Kafka -- Transactions

The `KafkaProducerHelper` supports exactly-once semantics via transactions. Requires `transactionalId` and `idempotent: true`.

```typescript
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'transactional-producer',
  transactionalId: 'my-tx-id',
  idempotent: true,
  acks: -1,
});

const result = await producer.runInTransaction(async ({ send, addConsumer, addOffset }) => {
  return send({
    messages: [
      { topic: 'orders', key: 'o1', value: JSON.stringify({ status: 'created' }) },
    ],
  });
});
```

The transaction context provides:

| Method | Description |
|--------|-------------|
| `send(opts)` | Send messages within the transaction. Returns `ProduceResult`. |
| `addConsumer(consumer)` | Add a consumer to the transaction for read-process-write patterns. |
| `addOffset(message)` | Commit consumer offsets as part of the transaction. |
| `transaction` | The underlying transaction object for advanced operations. |

If the callback throws, the transaction is automatically aborted.

### Kafka -- Health Checks

All Kafka helpers provide health checking via `BaseKafkaHelper`:

```typescript
producer.isHealthy();      // true when connected
consumer.isReady();        // true when connected AND active (consuming)
admin.getHealthStatus();   // 'connected' | 'disconnected' | 'unknown'
```

### Kafka -- Graceful Shutdown

All Kafka helpers support graceful shutdown with an optional force flag and configurable timeout (default: 30 seconds).

```typescript
// Graceful shutdown (waits up to shutdownTimeout, then forces)
await producer.close();
await consumer.close();
await admin.close();

// Force immediate shutdown
await producer.close({ isForce: true });
await consumer.close({ isForce: true });
```

For consumers, `close()` also stops lag monitoring and closes the message stream before closing the client.

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

### KafkaProducerHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `static newInstance(opts)` | `KafkaProducerHelper` | Factory method. |
| `getProducer()` | `Producer` | Access the underlying `@platformatic/kafka` Producer. |
| `runInTransaction(callback)` | `Promise<ResultType>` | Execute a callback within a Kafka transaction. Auto-commits or aborts. |
| `isHealthy()` | `boolean` | Returns `true` when connected to a broker. |
| `getHealthStatus()` | `TKafkaHealthStatus` | Returns `'connected'`, `'disconnected'`, or `'unknown'`. |
| `close(opts?)` | `Promise<void>` | Graceful shutdown. `opts: { isForce?: boolean }` |

### KafkaConsumerHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `static newInstance(opts)` | `KafkaConsumerHelper` | Factory method. |
| `getConsumer()` | `Consumer` | Access the underlying `@platformatic/kafka` Consumer. |
| `getStream()` | `MessagesStream \| null` | Access the current message stream (null if not started). |
| `start(opts)` | `Promise<void>` | Start consuming. `opts: { topics, mode?, fallbackMode? }` |
| `isReady()` | `boolean` | Returns `true` when connected AND actively consuming. |
| `isHealthy()` | `boolean` | Returns `true` when connected to a broker. |
| `getHealthStatus()` | `TKafkaHealthStatus` | Returns `'connected'`, `'disconnected'`, or `'unknown'`. |
| `startLagMonitoring(opts)` | `void` | Start lag monitoring. `opts: { topics, interval? }` |
| `stopLagMonitoring()` | `void` | Stop lag monitoring. |
| `close(opts?)` | `Promise<void>` | Graceful shutdown. Stops monitoring, closes stream, then client. |

### KafkaAdminHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `static newInstance(opts)` | `KafkaAdminHelper` | Factory method. |
| `getAdmin()` | `Admin` | Access the underlying `@platformatic/kafka` Admin. |
| `isHealthy()` | `boolean` | Returns `true` when connected to a broker. |
| `getHealthStatus()` | `TKafkaHealthStatus` | Returns `'connected'`, `'disconnected'`, or `'unknown'`. |
| `close(opts?)` | `Promise<void>` | Graceful shutdown. `opts: { isForce?: boolean }` |

### KafkaSchemaRegistryHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `static newInstance(opts)` | `KafkaSchemaRegistryHelper` | Factory method. |
| `getRegistry()` | `ConfluentSchemaRegistry` | Access the underlying schema registry. |
| `getSerializers()` | `Serializers` | Get serializers for use with a producer. |
| `getDeserializers()` | `Deserializers` | Get deserializers for use with a consumer. |

### MQTTClientHelper

| Method | Returns | Description |
|--------|---------|-------------|
| `configure()` | `void` | Connects to the MQTT broker. Called automatically by the constructor. |
| `subscribe(opts)` | `Promise<string[]>` | Subscribe to one or more topics. `opts: { topics: string[] }` |
| `publish(opts)` | `Promise<{ topic, message }>` | Publish a message to a topic. `opts: { topic: string; message: string \| Buffer }` |

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
  - [@platformatic/kafka](https://github.com/platformatic/kafka) -- Kafka client library
