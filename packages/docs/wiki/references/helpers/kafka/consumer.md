# Consumer

The `KafkaConsumerHelper` is a thin wrapper around `@platformatic/kafka`'s `Consumer`. It manages creation, logging, and lifecycle.

```typescript
class KafkaConsumerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper
```

## Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaConsumerHelper<K,V,HK,HV>` | Factory method |
| `getConsumer()` | `(): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>` | Access the underlying `Consumer` |
| `close(isForce?)` | `(isForce?: boolean): Promise<void>` | Close the consumer. Default: `force=true` |

> [!NOTE]
> Consumer defaults to `force=true` on close (unlike producer which defaults to `false`). This is because consumers should leave the group promptly to trigger faster rebalancing.

## IKafkaConsumerOpts

```typescript
interface IKafkaConsumerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>
  extends IKafkaConnectionOptions
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupId` | `string` | — | Consumer group ID. **Required** |
| `identifier` | `string` | `'kafka-consumer'` | Scoped logging identifier |
| `deserializers` | `Partial<Deserializers<K,V,HK,HV>>` | — | Key/value/header deserializers. **Pass explicitly** |
| `autocommit` | `boolean \| number` | `false` | Auto-commit offsets. `true` = default interval, `number` = custom interval in ms |
| `sessionTimeout` | `number` | `30000` | Session timeout — if no heartbeat within this period, consumer is removed from group |
| `heartbeatInterval` | `number` | `3000` | Heartbeat interval — must be less than `sessionTimeout` |
| `rebalanceTimeout` | `number` | `sessionTimeout` | Max time for rebalance — defaults to `sessionTimeout` value |
| `highWaterMark` | `number` | `1024` | Stream buffer size (messages) |
| `minBytes` | `number` | `1` | Min bytes per fetch response — broker waits until this threshold |
| `maxBytes` | `number` | — | Max bytes per fetch response per partition |
| `maxWaitTime` | `number` | — | Max time (ms) broker waits for `minBytes` |
| `metadataMaxAge` | `number` | `300000` | Metadata cache TTL (ms) — how often to refresh topic/partition info |
| `groupProtocol` | `'classic' \| 'consumer'` | `'classic'` | Consumer group protocol. `'consumer'` = KIP-848 (Kafka 3.7+) |
| `groupInstanceId` | `string` | — | Static group membership ID — prevents rebalance on restart |

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
  autocommit: false,
});

const consumer = helper.getConsumer();

const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'latest',
});

for await (const message of stream) {
  console.log(`${message.topic}[${message.partition}] @${message.offset}: ${message.key} → ${message.value}`);
  await message.commit();
}

await stream.close();
await helper.close();
```

---

## API Reference (`@platformatic/kafka`)

After calling `helper.getConsumer()`, you have full access to the `Consumer` class.

### `consumer.consume(options)`

Start consuming messages. Returns a `MessagesStream` (extends Node.js `Readable`).

```typescript
interface ConsumeOptions<Key, Value, HeaderKey, HeaderValue> {
  topics: string[];
  mode?: 'latest' | 'earliest' | 'committed' | 'manual';
  fallbackMode?: 'latest' | 'earliest' | 'fail';
  maxFetches?: number;
  offsets?: { topic: string; partition: number; offset: bigint }[];
  onCorruptedMessage?: CorruptedMessageHandler;
  // Plus ConsumeBaseOptions (autocommit, minBytes, maxBytes, etc.)
  // Plus GroupOptions (sessionTimeout, heartbeatInterval, etc.)
}
```

#### Stream Modes

| Mode | Description |
|------|-------------|
| `'committed'` | Resume from last committed offset. **Recommended for production** |
| `'latest'` | Start from the latest offset (skip existing messages) |
| `'earliest'` | Start from the beginning of the topic |
| `'manual'` | Start from explicitly provided offsets via `offsets` option |

#### Fallback Modes

Used when `mode: 'committed'` but no committed offset exists (new consumer group):

| Fallback | Description |
|----------|-------------|
| `'latest'` | Start from latest (default) — ignore historical messages |
| `'earliest'` | Start from beginning — process all historical messages |
| `'fail'` | Throw an error |

```typescript
// Production pattern: resume from committed, start from latest for new groups
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'latest',
});

// Replay all historical messages
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'earliest',
});

// Start from specific offsets
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'manual',
  offsets: [
    { topic: 'orders', partition: 0, offset: 100n },
    { topic: 'orders', partition: 1, offset: 200n },
  ],
});
```

---

## MessagesStream

`MessagesStream` extends Node.js `Readable`. It supports three consumption patterns:

### Pattern 1: Async Iterator (`for await`)

Best for sequential processing with backpressure:

```typescript
const stream = await consumer.consume({ topics: ['orders'], mode: 'committed', fallbackMode: 'latest' });

for await (const message of stream) {
  await processMessage(message);
  await message.commit();
}
```

### Pattern 2: Event-Based (`.on('data')`)

Best for high-throughput or when you need non-blocking processing:

```typescript
const stream = await consumer.consume({ topics: ['orders'], mode: 'committed', fallbackMode: 'latest' });

stream.on('data', (message) => {
  console.log(JSON.stringify({
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key,
    value: message.value,
    headers: Object.fromEntries(message.headers ?? new Map()),
    timestamp: message.timestamp,
  }, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));

  message.commit();
});

stream.on('error', (err) => {
  console.error('Stream error:', err);
});
```

> [!WARNING]
> `message.offset` and `message.timestamp` are `bigint`. When using `JSON.stringify`, you must provide a custom replacer:
> ```typescript
> JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
> ```

### Pattern 3: Pause/Resume

Manual flow control:

```typescript
stream.on('data', async (message) => {
  stream.pause();
  await heavyProcessing(message);
  message.commit();
  stream.resume();
});
```

### Message Object

Each message from the stream has the following shape:

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

| Property | Type | Description |
|----------|------|-------------|
| `topic` | `string` | Source topic |
| `partition` | `number` | Source partition |
| `offset` | `bigint` | Message offset within the partition |
| `key` | `KeyType` | Deserialized message key |
| `value` | `ValueType` | Deserialized message value |
| `headers` | `Map<HK, HV>` | Deserialized message headers |
| `timestamp` | `bigint` | Message timestamp (ms since epoch) |
| `metadata` | `Record<string, unknown>` | Additional metadata |
| `commit()` | `() => void \| Promise<void>` | Commit this message's offset |

### Stream Events

| Event | Payload | Description |
|-------|---------|-------------|
| `'data'` | `Message<K,V,HK,HV>` | New message received |
| `'error'` | `Error` | Stream error |
| `'close'` | — | Stream closed |
| `'end'` | — | Stream ended (all data consumed) |
| `'autocommit'` | `(err, offsets)` | Auto-commit completed (or failed) |
| `'fetch'` | — | Fetch request sent |
| `'offsets'` | — | Offsets updated |
| `'pause'` | — | Stream paused |
| `'resume'` | — | Stream resumed |
| `'readable'` | — | Stream has data available |

### Stream Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `close()` | `Promise<void>` | Close the stream and leave the consumer group |
| `isActive()` | `boolean` | Whether the stream is actively consuming |
| `isConnected()` | `boolean` | Whether the underlying connection is active |
| `pause()` | `this` | Pause consumption (stop fetching) |
| `resume()` | `this` | Resume consumption |
| `[Symbol.asyncIterator]()` | `AsyncIterator<Message>` | Async iteration support |

### Stream Properties

| Property | Type | Description |
|----------|------|-------------|
| `consumer` | `Consumer` | Reference to the parent consumer |
| `offsetsToFetch` | `Map<string, bigint>` | Next offsets to fetch per topic-partition |
| `offsetsToCommit` | `Map<string, CommitOptionsPartition>` | Pending commit offsets |
| `offsetsCommitted` | `Map<string, bigint>` | Last committed offsets |
| `committedOffsets` | `Map<string, bigint>` | Alias for `offsetsCommitted` |

---

## Offset Management

### Manual Commit

When `autocommit: false`, commit offsets explicitly after processing:

```typescript
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'latest',
});

for await (const message of stream) {
  try {
    await processMessage(message);
    await message.commit(); // Commit on success
  } catch (err) {
    // Don't commit — message will be redelivered
    console.error('Processing failed:', err);
  }
}
```

### Auto-Commit

Commit offsets automatically at a configurable interval:

```typescript
const helper = KafkaConsumerHelper.newInstance({
  // ...
  autocommit: true,      // Default interval
  // autocommit: 5000,   // Custom: commit every 5 seconds
});
```

### Bulk Commit via Consumer

```typescript
await consumer.commit({
  offsets: [
    { topic: 'orders', partition: 0, offset: 150n, leaderEpoch: 0 },
    { topic: 'orders', partition: 1, offset: 300n, leaderEpoch: 0 },
  ],
});
```

### List Offsets

```typescript
// Current log-end offsets
const offsets = await consumer.listOffsets({ topics: ['orders'] });
// Map<string, bigint[]> — topic → partition offsets

// Committed offsets
const committed = await consumer.listCommittedOffsets({
  topics: [{ topic: 'orders', partitions: [0, 1, 2] }],
});

// Offsets at a specific timestamp
const historical = await consumer.listOffsetsWithTimestamps({
  topics: ['orders'],
  timestamp: BigInt(Date.now() - 3600_000), // 1 hour ago
});
```

---

## Lag Monitoring

```typescript
// One-time lag check
const lag = await consumer.getLag({ topics: ['orders'] });
// Map<string, bigint[]> — topic → lag per partition

// Continuous monitoring (emits 'consumer:lag' events)
consumer.startLagMonitoring({ topics: ['orders'] }, 5000); // Check every 5s

consumer.on('consumer:lag', (lag) => {
  for (const [topic, partitionLags] of lag) {
    partitionLags.forEach((lagValue, partition) => {
      if (lagValue > 1000n) {
        console.warn(`High lag on ${topic}[${partition}]: ${lagValue}`);
      }
    });
  }
});

consumer.on('consumer:lag:error', (error) => {
  console.error('Lag monitoring error:', error);
});

// Stop monitoring
consumer.stopLagMonitoring();
```

---

## Consumer Events

The `Consumer` class emits lifecycle events via `consumer.on(event, handler)`:

| Event | Payload | Description |
|-------|---------|-------------|
| `'consumer:group:join'` | `{ groupId, memberId, generationId, isLeader, assignments }` | Joined consumer group |
| `'consumer:group:leave'` | `{ groupId, memberId, generationId }` | Left consumer group |
| `'consumer:group:rejoin'` | — | Rejoining group after rebalance |
| `'consumer:group:rebalance'` | `{ groupId }` | Partition rebalance triggered |
| `'consumer:heartbeat:start'` | `{ groupId, memberId, generationId }` | Heartbeat started |
| `'consumer:heartbeat:cancel'` | `{ groupId, memberId, generationId }` | Heartbeat cancelled |
| `'consumer:heartbeat:end'` | `{ groupId, memberId, generationId }` | Heartbeat completed |
| `'consumer:heartbeat:error'` | `{ groupId, memberId, generationId, error }` | Heartbeat failed |
| `'consumer:lag'` | `Map<string, bigint[]>` | Lag report (from `startLagMonitoring`) |
| `'consumer:lag:error'` | `Error` | Lag monitoring error |

**Base client events** (shared with Producer and Admin):

| Event | Payload | Description |
|-------|---------|-------------|
| `'client:broker:connect'` | `{ node, host, port }` | Connected to broker |
| `'client:broker:disconnect'` | `{ node, host, port }` | Disconnected from broker |
| `'client:broker:failed'` | `{ node, host, port }` | Broker connection failed |
| `'client:metadata'` | `ClusterMetadata` | Metadata refreshed |
| `'client:close'` | — | Client closed |

```typescript
consumer.on('consumer:group:join', ({ groupId, memberId, assignments }) => {
  console.log(`Joined group ${groupId} as ${memberId}`);
  console.log('Assigned partitions:', assignments);
});

consumer.on('consumer:group:rebalance', ({ groupId }) => {
  console.log(`Rebalance triggered for group ${groupId}`);
});
```

---

## Consumer Group Management

```typescript
// Consumer properties
consumer.groupId;        // string
consumer.memberId;       // string | null
consumer.generationId;   // number
consumer.assignments;    // GroupAssignment[] | null
consumer.isActive();     // boolean
consumer.lastHeartbeat;  // Date | null

// Manually leave and rejoin group
await consumer.leaveGroup();
await consumer.joinGroup();

// Static membership — prevents rebalance on restart
const helper = KafkaConsumerHelper.newInstance({
  // ...
  groupInstanceId: 'worker-1', // Unique per instance
  sessionTimeout: 60_000,      // Longer timeout for static members
});
```

---

## Consumer Group Partitioning

When multiple consumers share the same `groupId`, Kafka distributes topic partitions across group members:

```
Topic "orders" (3 partitions)
├── Partition 0 → Consumer A
├── Partition 1 → Consumer B
└── Partition 2 → Consumer C
```

- Each partition is assigned to **exactly one** consumer in the group
- If a consumer leaves/crashes, its partitions are redistributed (**rebalance**)
- If consumers > partitions, excess consumers sit idle
- Messages within a partition are processed **in order**

```bash
# Terminal 1 — gets partition 0
bun run consumer.ts --clientId=worker-1

# Terminal 2 — gets partition 1
bun run consumer.ts --clientId=worker-2

# Terminal 3 — gets partition 2
bun run consumer.ts --clientId=worker-3
```

> [!TIP]
> Create topics with enough partitions for your expected parallelism. You can increase partitions later with `admin.createPartitions()`, but you cannot decrease them.
