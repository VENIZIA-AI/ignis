---
title: Kafka Consumer
description: KafkaConsumerHelper - message callbacks, automatic reconnect, and lag monitoring
difficulty: intermediate
---

# Consumer

The `KafkaConsumerHelper` wraps `@platformatic/kafka`'s `Consumer` with health tracking, graceful shutdown, message callbacks, group callbacks, automatic reconnect, and lag monitoring.

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
| `start(opts)` | `(opts: IKafkaConsumeStartOptions): Promise<void>` | Start consuming (creates stream, wires callbacks, drives automatic reconnect) |
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

Plus the shared [Connection & Authentication](./producer#connection--authentication) options (`bootstrapBrokers`, `clientId`, `retries`, `sasl`, `tls`, ...), documented once on the Producer page.

### Consumer Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupId` | `string` | - | Consumer group ID. **Required** |
| `identifier` | `string` | `'kafka-consumer'` | Scoped logging identifier |
| `deserializers` | `Partial<Deserializers<K,V,HK,HV>>` | - | Key/value/header deserializers |
| `autocommit` | `boolean \| number` | `false` | Auto-commit offsets. `true` = default interval, `number` = custom ms |
| `sessionTimeout` | `number` | `60000` | Session timeout - consumer removed from group if no heartbeat |
| `heartbeatInterval` | `number` | `10000` | Heartbeat interval - must be less than `sessionTimeout` |
| `rebalanceTimeout` | `number` | `sessionTimeout` | Max time for rebalance. Defaults to the value of `sessionTimeout` |
| `highWaterMark` | `number` | `1024` | Stream buffer size (messages) |
| `minBytes` | `number` | `1` | Min bytes per fetch response |
| `maxBytes` | `number` | `10485760` (10 MB) | Max bytes per fetch response per partition |
| `maxWaitTime` | `number` | `5000` | Max time (ms) broker waits for `minBytes` |
| `metadataMaxAge` | `number` | `300000` | Metadata cache TTL (ms) |
| `groupProtocol` | `'classic' \| 'consumer'` | `'classic'` | Consumer group protocol. `'consumer'` = KIP-848 (Kafka 3.7+) |
| `groupInstanceId` | `string` | - | Static group membership ID - prevents rebalance on restart |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in ms |
| `registry` | `SchemaRegistry` | - | Schema registry for auto deser |

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

- **`onMessage` is the main processing callback.** Put your business logic here.
- **`onMessageDone` fires only after `onMessage` resolves successfully.** Use it for logging, metrics, and similar side effects. An error thrown from `onMessageDone` also triggers `onMessageError`.
- **`onMessageError` fires if `onMessage` throws.** It also fires for the stream's own `'error'` event. That case carries no `message` - it's a stream-level error, not a per-message one.
- **The stream `'error'` listener is always attached**, whether or not you pass `onMessageError`. An `EventEmitter` `'error'` event with zero listeners becomes an uncaught exception.
- **Pull-style consumers benefit too.** Without this listener, a consumer using `start()` + `getStream()` with no `onMessage` would take down the whole process on the first broker drop.

## start()

`start()` creates the consume stream and wires all message callbacks. Call it explicitly after construction - the constructor never calls it for you. It also guards against duplicate starts: calling it twice logs a warning and returns immediately.

```typescript
interface IKafkaConsumeStartOptions {
  topics: string[];
  mode?: MessagesStreamModeValue;
  fallbackMode?: MessagesStreamFallbackModeValue;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}
```

| Mode | Description |
|------|-------------|
| `'committed'` (default) | Resume from last committed offset. **Recommended for production** |
| `'latest'` | Start from the latest offset (skip existing messages) |
| `'earliest'` | Start from the beginning of the topic |
| `'manual'` | Start from explicitly provided offsets |

| Fallback | Description |
|----------|-------------|
| `'latest'` (default) | Start from latest - ignore historical messages |
| `'earliest'` | Start from beginning - process all historical messages |
| `'fail'` | Throw an error |

| Reconnect option | Default | Description |
|-------------------|---------|-------------|
| `reconnectDelayMs` | `2000` | Delay before each automatic reconnect attempt |
| `maxReconnectAttempts` | `5` | Consecutive reconnect attempts before the consume loop gives up |

```typescript
// Production pattern
await helper.start({ topics: ['orders'] });

// Replay all historical messages
await helper.start({ topics: ['orders'], mode: 'earliest' });

// Custom mode and reconnect budget
await helper.start({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'earliest',
  reconnectDelayMs: 5_000,
  maxReconnectAttempts: 10,
});
```

## Automatic reconnect

When `onMessage` is provided, `start()` drives a background consume loop on top of the stream. That loop reconnects on its own:

- **Only the callback-driven loop reconnects.** A pull-style consumer using `getStream()` or `consumer.consume()` directly owns its own retry logic. The helper's automatic reconnect runs only inside `startConsumeLoop`, which is wired exclusively when `onMessage` is set.
- **A full broker outage marks the session stale.** This happens when every broker disconnects - `getConnectedBrokerCount()` drops to `0` via `client:broker:disconnect` or `client:broker:failed` events.
- **The helper reacts immediately.** It destroys the current stream right away, instead of waiting for the stream to error out on its own.
- **Reconnect rebuilds the client after a stale session.** The next attempt, after `reconnectDelayMs`, constructs a brand-new `@platformatic/kafka` `Consumer` with the original options and swaps it in.
- **A fresh client forces a clean group rejoin**, instead of reusing session state Kafka has likely already expired. Lag monitoring re-arms automatically on the new client.
- **Attempts are capped.** After `maxReconnectAttempts` consecutive failures, the consume loop exits and logs an error. Message processing stops until you call `start()` again with a new set of options.
- **Every retry is logged**: the attempt number, the delay, and the current connected-broker count. A stuck reconnect loop stays visible in application logs without extra instrumentation.

## Lag Monitoring

```typescript
// Start monitoring (polls every interval)
helper.startLagMonitoring({ topics: ['orders'], interval: 10_000 });

// Stop monitoring
helper.stopLagMonitoring();
```

Lag data arrives through the `onLag` callback; errors through `onLagError`. `interval` defaults to `30000` ms. Calling `startLagMonitoring()` twice logs a warning instead of starting a second poll loop.

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

// Static membership - prevents rebalance on restart
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

## See also

- [Kafka Overview](./) - the four helpers, shared health/close API, and the compile-binary caveat
- [Producer](./producer) - the sending side, plus the shared Connection & Authentication options
- [Admin](./admin) - create topics and inspect consumer groups from outside the running consumer
- [Examples & Troubleshooting](./examples) - IoC wiring and the common connection-error lookup table

**Files:**

- [`packages/helpers/src/modules/queue/kafka/consumer.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/consumer.ts) - `KafkaConsumerHelper`, consume loop, automatic reconnect
- [`packages/helpers/src/modules/queue/kafka/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/base.ts) - `BaseKafkaHelper`, shared health tracking and shutdown
- [`packages/helpers/src/modules/queue/kafka/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/types.ts) - `IKafkaConsumerOptions`, `IKafkaConsumeStartOptions`
