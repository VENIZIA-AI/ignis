# Producer

The `KafkaProducerHelper` wraps `@platformatic/kafka`'s `Producer` with health tracking, graceful shutdown, broker event callbacks, and a transaction helper.

```typescript
class KafkaProducerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseKafkaHelper<Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>>
```

## Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaProducerHelper<K,V,HK,HV>` | Factory method |
| `getProducer()` | `(): Producer<K,V,HK,HV>` | Access the underlying `Producer` |
| `runInTransaction(cb)` | `<R>(cb: TKafkaTransactionCallback<R,K,V,HK,HV>): Promise<R>` | Execute callback within a Kafka transaction |
| `isHealthy()` | `(): boolean` | `true` when broker connected |
| `isReady()` | `(): boolean` | Same as `isHealthy()` |
| `getHealthStatus()` | `(): TKafkaHealthStatus` | `'connected'` \| `'disconnected'` \| `'unknown'` |
| `close(opts?)` | `(opts?: { isForce?: boolean }): Promise<void>` | Close the producer (default: graceful) |

## IKafkaProducerOptions

```typescript
interface IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>
  extends IKafkaConnectionOptions
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | `'kafka-producer'` | Scoped logging identifier |
| `serializers` | `Partial<Serializers<K,V,HK,HV>>` | -- | Key/value/header serializers |
| `compression` | `CompressionAlgorithmValue` | -- | `'none'`, `'gzip'`, `'snappy'`, `'lz4'`, `'zstd'` |
| `acks` | `TKafkaAcks` | -- | Acknowledgment level: `0`, `1`, or `-1` |
| `idempotent` | `boolean` | -- | Enable idempotent producer (exactly-once within partition) |
| `transactionalId` | `string` | -- | Transactional ID for exactly-once across partitions |
| `strict` | `boolean` | `true` | Strict mode -- fail on unknown topics |
| `autocreateTopics` | `boolean` | `false` | Auto-create topics on first produce |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in ms |
| `registry` | `SchemaRegistry` | -- | Schema registry for auto ser/deser |
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | -- | Called when broker connects |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | -- | Called when broker disconnects |

Plus all [Connection Options](./#connection-options).

## Basic Example

```typescript
import { KafkaProducerHelper, KafkaAcks } from '@venizia/ignis-helpers/kafka';
import { stringSerializers } from '@platformatic/kafka';

const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'order-producer',
  serializers: stringSerializers,
  acks: KafkaAcks.ALL,
  compression: 'gzip',
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),
});

// Health check
helper.isHealthy();      // true when connected
helper.getHealthStatus(); // 'connected' | 'disconnected' | 'unknown'

// Send messages via the underlying producer
const producer = helper.getProducer();

await producer.send({
  messages: [
    { topic: 'orders', key: 'order-123', value: JSON.stringify({ status: 'created' }) },
  ],
});

// Batch send (single request, multiple messages)
await producer.send({
  messages: [
    { topic: 'orders', key: 'order-124', value: JSON.stringify({ status: 'created' }) },
    { topic: 'inventory', key: 'sku-001', value: JSON.stringify({ delta: -1 }) },
  ],
});

// Graceful close (waits for in-flight, times out after shutdownTimeout -> force)
await helper.close();

// Or force close immediately
await helper.close({ isForce: true });
```

## Transactions

`runInTransaction()` wraps `beginTransaction()` -> callback -> `commit()` / `abort()` with automatic logging.

> [!NOTE]
> Requires `transactionalId` and `idempotent: true` in producer options.

```typescript
const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'tx-producer',
  serializers: stringSerializers,
  transactionalId: 'my-tx-id',
  idempotent: true,
});

// Simple transaction
const result = await helper.runInTransaction(async ({ send }) => {
  return send({
    messages: [
      { topic: 'orders', key: 'o1', value: '{"status":"paid"}' },
      { topic: 'inventory', key: 'sku-1', value: '{"delta":-1}' },
    ],
  });
});

// Exactly-once consume-transform-produce (with consumer offset commit)
const result = await helper.runInTransaction(async ({ send, addConsumer, addOffset }) => {
  // Add consumer to transaction (for exactly-once semantics)
  await addConsumer(consumer.getConsumer());

  // Add the consumed message offset (will be committed on tx.commit())
  await addOffset(incomingMessage);

  // Produce transformed result
  return send({
    messages: [{ topic: 'output', key: incomingMessage.key, value: transformed }],
  });
});
```

### Transaction Context

The callback receives an `IKafkaTransactionContext`:

| Property | Type | Description |
|----------|------|-------------|
| `transaction` | `Transaction` | The underlying platformatic transaction |
| `send(opts)` | `(opts: SendOptions) => Promise<ProduceResult>` | Send messages within the transaction |
| `addConsumer(consumer)` | `(consumer: Consumer) => Promise<void>` | Add a consumer for exactly-once |
| `addOffset(message)` | `(message: Message) => Promise<void>` | Add consumed message offset to transaction |

If the callback throws, the transaction is automatically aborted and the error re-thrown.

## Graceful Shutdown

`close()` implements a two-phase shutdown:

1. **Graceful** (default): Calls `close(true)` on the underlying producer (force-flush), with a timeout (`shutdownTimeout`, default 30s)
2. **Force fallback**: If graceful times out, automatically force-closes
3. **Force** (`{ isForce: true }`): Immediately calls `close(true)` without timeout protection

After `close()`, `healthStatus` is set to `'disconnected'`.

```typescript
// Graceful (recommended)
await helper.close();

// Force
await helper.close({ isForce: true });
```

## API Reference (`@platformatic/kafka`)

After calling `helper.getProducer()`, you have full access to the `Producer` class:

### `producer.send(options)`

Send messages to one or more topics.

```typescript
interface SendOptions<Key, Value, HeaderKey, HeaderValue> {
  messages: MessageToProduce<Key, Value, HeaderKey, HeaderValue>[];
  acks?: number;
  compression?: CompressionAlgorithmValue;
  partitioner?: Partitioner<Key, Value, HeaderKey, HeaderValue>;
  idempotent?: boolean;
  autocreateTopics?: boolean;
}

interface MessageToProduce<Key, Value, HeaderKey, HeaderValue> {
  topic: string;
  key?: Key;
  value?: Value;
  partition?: number;     // Explicit partition (overrides partitioner)
  timestamp?: bigint;     // Message timestamp
  headers?: Map<HeaderKey, HeaderValue> | Record<string, HeaderValue>;
}

interface ProduceResult {
  offsets?: { topic: string; partition: number; offset: bigint }[];
  unwritableNodes?: number[];
}
```

**Examples:**

```typescript
// With headers
await producer.send({
  messages: [{
    topic: 'events',
    key: 'user-1',
    value: '{"action":"login"}',
    headers: { 'x-trace-id': 'abc123', 'x-source': 'auth-service' },
  }],
});

// Tombstone (delete compacted key)
await producer.send({
  messages: [{ topic: 'users', key: 'user-deleted-123', value: undefined }],
});

// Explicit partition
await producer.send({
  messages: [{ topic: 'events', key: 'e1', value: 'data', partition: 2 }],
});
```

### `producer.asStream(options)`

Create a `Writable` stream for high-throughput producing with automatic batching.

```typescript
const stream = producer.asStream({ batchSize: 100, batchTime: 1000 });

stream.write({ topic: 'events', key: 'e1', value: '{"type":"click"}' });
stream.write({ topic: 'events', key: 'e2', value: '{"type":"scroll"}' });

stream.on('data', (report) => {
  console.log(`Batch ${report.batchId}: ${report.count} messages sent`);
});

await stream.close();
```

### `producer.close(force?)`

Close the producer connection.

- `force=false` (default): Wait for in-flight requests to complete
- `force=true`: Abort immediately

### Producer Properties

| Property | Type | Description |
|----------|------|-------------|
| `producerId` | `bigint \| undefined` | Assigned producer ID (after idempotent init) |
| `producerEpoch` | `number \| undefined` | Producer epoch (fencing) |
| `transaction` | `Transaction \| undefined` | Active transaction (if any) |
| `coordinatorId` | `number` | Transaction coordinator broker ID |
| `streamsCount` | `number` | Number of active producer streams |

## Key Partitioning

By default, `@platformatic/kafka` uses **murmur2 hashing** on the message key to determine the target partition:

- Same key -> always same partition -> guaranteed ordering per key
- `undefined` key -> round-robin across partitions
- Explicit `partition` field -> overrides the partitioner

```typescript
// Custom partitioner
await producer.send({
  messages: [{ topic: 'events', key: 'e1', value: 'data' }],
  partitioner: (message) => {
    return message.key!.charCodeAt(0) % 3;
  },
});
```
