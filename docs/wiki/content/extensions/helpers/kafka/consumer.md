# Consumer

The `KafkaConsumerHelper` wraps `@platformatic/kafka`'s `Consumer` with health tracking, graceful shutdown, message callbacks, consumer group event callbacks, and lag monitoring.

```typescript
class KafkaConsumerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseKafkaHelper<Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>>
```

## Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaConsumerHelper<K,V,HK,HV>` | Factory method |
| `getConsumer()` | `(): Consumer<K,V,HK,HV>` | Access the underlying `Consumer` |
| `getStream()` | `(): MessagesStream \| null` | Get the active stream (after `start()`) |
| `start(opts)` | `(opts: IKafkaConsumeStartOptions): Promise<void>` | Start consuming (creates stream, wires callbacks) |
| `startLagMonitoring(opts)` | `(opts: { topics: string[]; interval?: number }): void` | Start periodic lag monitoring |
| `stopLagMonitoring()` | `(): void` | Stop lag monitoring |
| `isHealthy()` | `(): boolean` | `true` when at least one broker connected |
| `isReady()` | `(): boolean` | `isHealthy()` **and** `consumer.isActive()` |
| `getHealthStatus()` | `(): TKafkaHealthStatus` | `'connected'` \| `'disconnected'` \| `'unknown'` |
| `getConnectedBrokerCount()` | `(): number` | Number of currently connected brokers |
| `close(opts?)` | `(opts?: { isForce?: boolean }): Promise<void>` | Stop lag, close stream, close consumer |

## IKafkaConsumerOptions

```typescript
interface IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>
  extends IKafkaConnectionOptions
```

### Consumer Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupId` | `string` | -- | Consumer group ID. **Required** |
| `identifier` | `string` | `'kafka-consumer'` | Scoped logging identifier |
| `deserializers` | `Partial<Deserializers<K,V,HK,HV>>` | -- | Key/value/header deserializers |
| `autocommit` | `boolean \| number` | `false` | Auto-commit offsets. `true` = default interval, `number` = custom ms |
| `sessionTimeout` | `number` | `60000` | Session timeout -- consumer removed from group if no heartbeat |
| `heartbeatInterval` | `number` | `10000` | Heartbeat interval -- must be less than `sessionTimeout` |
| `rebalanceTimeout` | `number` | `sessionTimeout` | Max time for rebalance. Defaults to the value of `sessionTimeout` |
| `highWaterMark` | `number` | `1024` | Stream buffer size (messages) |
| `minBytes` | `number` | `1` | Min bytes per fetch response |
| `maxBytes` | `number` | -- | Max bytes per fetch response per partition |
| `maxWaitTime` | `number` | -- | Max time (ms) broker waits for `minBytes` |
| `metadataMaxAge` | `number` | `300000` | Metadata cache TTL (ms) |
| `groupProtocol` | `'classic' \| 'consumer'` | `'classic'` | Consumer group protocol. `'consumer'` = KIP-848 (Kafka 3.7+) |
| `groupInstanceId` | `string` | -- | Static group membership ID -- prevents rebalance on restart |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in ms |
| `registry` | `SchemaRegistry` | -- | Schema registry for auto deser |

### Lifecycle Callbacks

| Option | Type | Description |
|--------|------|-------------|
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | Called when broker connects |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | Called when broker disconnects |

### Message Callbacks

| Option | Type | Description |
|--------|------|-------------|
| `onMessage` | `TKafkaMessageCallback<K,V,HK,HV>` | Called for each message. Receives `{ message }` |
| `onMessageDone` | `TKafkaMessageDoneCallback<K,V,HK,HV>` | Called after `onMessage` succeeds. Receives `{ message }` |
| `onMessageError` | `TKafkaMessageErrorCallback<K,V,HK,HV>` | Called on processing error. Receives `{ error, message? }` |

### Consumer Group Callbacks

| Option | Type | Description |
|--------|------|-------------|
| `onGroupJoin` | `TKafkaGroupJoinCallback` | Receives `{ groupId, memberId, generationId? }` |
| `onGroupLeave` | `TKafkaGroupLeaveCallback` | Receives `{ groupId, memberId }` |
| `onGroupRebalance` | `TKafkaGroupRebalanceCallback` | Receives `{ groupId }` |
| `onHeartbeatError` | `TKafkaHeartbeatErrorCallback` | Receives `{ error, groupId?, memberId? }` |

### Lag Monitoring Callbacks

| Option | Type | Description |
|--------|------|-------------|
| `onLag` | `TKafkaLagCallback` | Receives `{ lag }` (Offsets map) |
| `onLagError` | `TKafkaLagErrorCallback` | Receives `{ error }` |

Plus all [Connection Options](./#connection-options).

## Basic Example

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringDeserializers } from '@platformatic/kafka';

const helper = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'order-consumer',
  groupId: 'order-processing',
  deserializers: stringDeserializers,

  // Message lifecycle
  onMessage: async ({ message }) => {
    console.log(`${message.topic}[${message.partition}] @${message.offset}: ${message.key} -> ${message.value}`);
    await message.commit();
  },
  onMessageDone: ({ message }) => {
    console.log(`Done processing: ${message.key}`);
  },
  onMessageError: ({ error, message }) => {
    console.error('Processing failed:', error.message, message?.key);
  },

  // Consumer group events
  onGroupJoin: ({ groupId, memberId }) => console.log(`Joined ${groupId} as ${memberId}`),
  onGroupLeave: ({ groupId }) => console.log(`Left ${groupId}`),
  onGroupRebalance: ({ groupId }) => console.log(`Rebalance in ${groupId}`),
  onHeartbeatError: ({ error }) => console.error('Heartbeat failed:', error),

  // Broker events
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),

  // Lag monitoring
  onLag: ({ lag }) => {
    for (const [topic, partitionLags] of lag) {
      partitionLags.forEach((lagValue, partition) => {
        if (lagValue > 1000n) {
          console.warn(`High lag on ${topic}[${partition}]: ${lagValue}`);
        }
      });
    }
  },
  onLagError: ({ error }) => console.error('Lag monitoring error:', error),
});

// Start consuming
await helper.start({ topics: ['orders'] });

// Start lag monitoring (optional)
helper.startLagMonitoring({ topics: ['orders'], interval: 10_000 });

// Health check
helper.isHealthy(); // true when at least one broker connected
helper.isReady();   // true when at least one broker connected AND consumer is active

// Shutdown
await helper.close();
```

## Message Callback Flow

When `start()` is called, the helper creates a `MessagesStream` and wires the callbacks:

```
Stream 'data' event
  -> onMessage({ message })
    +-- success -> onMessageDone({ message })
    +-- error   -> onMessageError({ error, message })

Stream 'error' event
  -> onMessageError({ error })  (no message available)
```

- `onMessage` is the main processing callback -- do your business logic here
- `onMessageDone` fires only after `onMessage` resolves successfully -- use for logging, metrics, etc.
- `onMessageError` fires if `onMessage` throws -- use for error tracking. Note that errors from `onMessageDone` also trigger `onMessageError`
- The stream `'error'` event also calls `onMessageError` (without `message` since it's a stream-level error), but only if `onMessageError` was provided

## start()

`start()` creates the consume stream and wires all message callbacks. It must be called explicitly after construction.

```typescript
interface IKafkaConsumeStartOptions {
  topics: string[];
  mode?: MessagesStreamModeValue;         // Default: 'committed'
  fallbackMode?: MessagesStreamFallbackModeValue; // Default: 'latest'
}
```

| Mode | Description |
|------|-------------|
| `'committed'` | Resume from last committed offset. **Recommended for production** |
| `'latest'` | Start from the latest offset (skip existing messages) |
| `'earliest'` | Start from the beginning of the topic |
| `'manual'` | Start from explicitly provided offsets |

| Fallback | Description |
|----------|-------------|
| `'latest'` | Start from latest (default) -- ignore historical messages |
| `'earliest'` | Start from beginning -- process all historical messages |
| `'fail'` | Throw an error |

```typescript
// Production pattern
await helper.start({ topics: ['orders'] });

// Replay all historical messages
await helper.start({ topics: ['orders'], mode: 'earliest' });

// Custom mode
await helper.start({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'earliest',
});
```

Guards against duplicate starts -- calling `start()` twice logs a warning and returns immediately.

## Lag Monitoring

```typescript
// Start monitoring (polls every interval)
helper.startLagMonitoring({ topics: ['orders'], interval: 10_000 });

// Stop monitoring
helper.stopLagMonitoring();
```

Lag data is delivered via the `onLag` callback. Errors via `onLagError`.

Guards against duplicate starts -- calling `startLagMonitoring()` twice logs a warning.

For one-time lag checks, use the underlying consumer directly:

```typescript
const lag = await helper.getConsumer().getLag({ topics: ['orders'] });
```

## Graceful Shutdown

`close()` implements an ordered shutdown:

1. Stop lag monitoring
2. Close the stream (calls `stream.close()` callback-style)
3. Close the consumer client (calls `client.close(true)` with graceful timeout, or force)
4. Set health status to `'disconnected'`

```typescript
// Graceful (recommended)
await helper.close();

// Force
await helper.close({ isForce: true });
```

## Direct Stream Access

If you don't use the callback pattern, you can access the stream directly after `start()`:

```typescript
// After start()
const stream = helper.getStream();

// Or use the consumer directly (bypass helper's start())
const consumer = helper.getConsumer();
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'latest',
});

for await (const message of stream) {
  await processMessage(message);
  await message.commit();
}
```

## API Reference (`@platformatic/kafka`)

### Message Object

```typescript
interface Message<Key, Value, HeaderKey, HeaderValue> {
  topic: string;
  key: Key;
  value: Value;
  partition: number;
  offset: bigint;
  timestamp: bigint;
  headers: Map<HeaderKey, HeaderValue>;
  metadata: Record<string, unknown>;
  commit(callback?: (error?: Error) => void): void | Promise<void>;
  toJSON(): MessageJSON<Key, Value, HeaderKey, HeaderValue>;
}
```

> [!WARNING]
> `message.offset` and `message.timestamp` are `bigint`. When using `JSON.stringify`, provide a custom replacer:
> ```typescript
> JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
> ```

### MessagesStream

`MessagesStream` extends Node.js `Readable`. Three consumption patterns:

**Async Iterator** (sequential, backpressure):
```typescript
for await (const message of stream) {
  await processMessage(message);
  await message.commit();
}
```

**Event-Based** (high-throughput):
```typescript
stream.on('data', (message) => {
  processMessage(message);
  message.commit();
});
```

**Pause/Resume** (manual flow control):
```typescript
stream.on('data', async (message) => {
  stream.pause();
  await heavyProcessing(message);
  message.commit();
  stream.resume();
});
```

### Offset Management

```typescript
// Manual commit (when autocommit: false)
for await (const message of stream) {
  await processMessage(message);
  await message.commit();
}

// Bulk commit
await consumer.commit({
  offsets: [
    { topic: 'orders', partition: 0, offset: 150n, leaderEpoch: 0 },
    { topic: 'orders', partition: 1, offset: 300n, leaderEpoch: 0 },
  ],
});

// List offsets
const offsets = await consumer.listOffsets({ topics: ['orders'] });
const committed = await consumer.listCommittedOffsets({
  topics: [{ topic: 'orders', partitions: [0, 1, 2] }],
});
```

### Consumer Group Management

```typescript
consumer.groupId;        // string
consumer.memberId;       // string | null
consumer.generationId;   // number
consumer.assignments;    // GroupAssignment[] | null
consumer.isActive();     // boolean

// Static membership -- prevents rebalance on restart
const helper = KafkaConsumerHelper.newInstance({
  ...
  groupInstanceId: 'worker-1',
  sessionTimeout: 60_000,
});
```

### Consumer Group Partitioning

When multiple consumers share the same `groupId`, Kafka distributes topic partitions across group members:

```
Topic "orders" (3 partitions)
+-- Partition 0 -> Consumer A
+-- Partition 1 -> Consumer B
+-- Partition 2 -> Consumer C
```

- Each partition is assigned to **exactly one** consumer in the group
- If a consumer leaves/crashes, its partitions are redistributed (**rebalance**)
- If consumers > partitions, excess consumers sit idle
- Messages within a partition are processed **in order**

> [!TIP]
> Create topics with enough partitions for your expected parallelism. You can increase partitions later with `admin.createPartitions()`, but you cannot decrease them.
