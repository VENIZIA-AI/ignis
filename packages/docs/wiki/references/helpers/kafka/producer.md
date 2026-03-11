# Producer

The `KafkaProducerHelper` is a thin wrapper around `@platformatic/kafka`'s `Producer`. It manages creation, logging, and lifecycle.

```typescript
class KafkaProducerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper
```

## Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaProducerHelper<K,V,HK,HV>` | Factory method |
| `getProducer()` | `(): Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>` | Access the underlying `Producer` |
| `close(isForce?)` | `(isForce?: boolean): Promise<void>` | Close the producer. Default: `force=false` |

## IKafkaProducerOpts

```typescript
interface IKafkaProducerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>
  extends IKafkaConnectionOptions
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | `'kafka-producer'` | Scoped logging identifier |
| `serializers` | `Partial<Serializers<K,V,HK,HV>>` | — | Key/value/header serializers. **Pass explicitly** |
| `compression` | `CompressionAlgorithmValue` | — | `'none'`, `'gzip'`, `'snappy'`, `'lz4'`, `'zstd'` |
| `acks` | `TKafkaAcks` | — | Acknowledgment level: `0`, `1`, or `-1` |
| `idempotent` | `boolean` | — | Enable idempotent producer (exactly-once within partition) |
| `transactionalId` | `string` | — | Transactional ID for exactly-once across partitions |
| `strict` | `boolean` | `true` | Strict mode — fail on unknown topics |
| `autocreateTopics` | `boolean` | `false` | Auto-create topics on first produce |

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
});

const producer = helper.getProducer();

// Send a single message
await producer.send({
  messages: [
    { topic: 'orders', key: 'order-123', value: JSON.stringify({ status: 'created' }) },
  ],
});

// Send multiple messages (batched in a single request)
await producer.send({
  messages: [
    { topic: 'orders', key: 'order-124', value: JSON.stringify({ status: 'created' }) },
    { topic: 'orders', key: 'order-125', value: JSON.stringify({ status: 'created' }) },
    { topic: 'inventory', key: 'sku-001', value: JSON.stringify({ delta: -1 }) },
  ],
});

await helper.close();
```

### Generic Types Example

```typescript
// Custom: string keys, JSON object values
const helper = KafkaProducerHelper.newInstance<string, MyEvent, string, string>({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'typed-producer',
  serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
});
```

---

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

// Returns
interface ProduceResult {
  offsets?: { topic: string; partition: number; offset: bigint }[];
  unwritableNodes?: number[];
}
```

**Examples:**

```typescript
// Basic send
await producer.send({
  messages: [{ topic: 'events', key: 'user-1', value: '{"action":"login"}' }],
});

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

// Override compression per-send
await producer.send({
  messages: [{ topic: 'logs', key: 'l1', value: largePayload }],
  compression: 'zstd',
});
```

### `producer.asStream(options)`

Create a `Writable` stream for high-throughput producing with automatic batching.

```typescript
interface ProducerStreamOptions<Key, Value, HeaderKey, HeaderValue> {
  highWaterMark?: number;   // Stream buffer size
  batchSize?: number;       // Messages per batch
  batchTime?: number;       // Max ms before flushing batch
  reportMode?: 'none' | 'batch' | 'message';
  // ... plus all SendOptions except messages
}
```

```typescript
const stream = producer.asStream({ batchSize: 100, batchTime: 1000 });

// Write messages — automatically batched
stream.write({ topic: 'events', key: 'e1', value: '{"type":"click"}' });
stream.write({ topic: 'events', key: 'e2', value: '{"type":"scroll"}' });

// Listen for batch completion
stream.on('data', (report) => {
  console.log(`Batch ${report.batchId}: ${report.count} messages sent`);
});

// Close when done
await stream.close();
```

### `producer.beginTransaction(options?)`

Start a Kafka transaction for exactly-once semantics across multiple topics/partitions.

> [!NOTE]
> Requires `transactionalId` in producer options and `idempotent: true`.

```typescript
const producer = new Producer({
  clientId: 'tx-producer',
  bootstrapBrokers: ['localhost:9092'],
  transactionalId: 'my-tx-id',
  idempotent: true,
  serializers: stringSerializers,
});

const tx = await producer.beginTransaction();
try {
  await tx.send({
    messages: [
      { topic: 'orders', key: 'o1', value: '{"status":"paid"}' },
      { topic: 'inventory', key: 'sku-1', value: '{"delta":-1}' },
    ],
  });
  await tx.commit();
} catch (err) {
  await tx.abort();
  throw err;
}
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

---

## Key Partitioning

By default, `@platformatic/kafka` uses **murmur2 hashing** on the message key to determine the target partition:

```
partition = murmur2(key) % numPartitions
```

- Same key → always same partition → guaranteed ordering per key
- `undefined` key → round-robin across partitions
- Explicit `partition` field → overrides the partitioner

```typescript
// Key-based routing: all "user-123" messages go to the same partition
await producer.send({
  messages: [
    { topic: 'events', key: 'user-123', value: '{"action":"login"}' },
    { topic: 'events', key: 'user-123', value: '{"action":"click"}' },  // Same partition
    { topic: 'events', key: 'user-456', value: '{"action":"login"}' },  // Different partition
  ],
});

// Custom partitioner
await producer.send({
  messages: [{ topic: 'events', key: 'e1', value: 'data' }],
  partitioner: (message) => {
    // Route by first character of key
    return message.key!.charCodeAt(0) % 3;
  },
});
```
