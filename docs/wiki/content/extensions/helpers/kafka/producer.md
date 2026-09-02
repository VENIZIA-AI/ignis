---
title: Kafka Producer
description: KafkaProducerHelper - connection, SASL, serialization, compression, and transactions
difficulty: intermediate
---

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
| `isHealthy()` | `(): boolean` | `true` when at least one broker connected |
| `isReady()` | `(): boolean` | Same as `isHealthy()` |
| `getHealthStatus()` | `(): TKafkaHealthStatus` | `'connected'` \| `'disconnected'` \| `'unknown'` |
| `getConnectedBrokerCount()` | `(): number` | Number of currently connected brokers |
| `close(opts?)` | `(opts?: { isForce?: boolean }): Promise<void>` | Close the producer (default: graceful) |

## IKafkaProducerOptions

```typescript
interface IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>
  extends IKafkaConnectionOptions
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | `'kafka-producer'` | Scoped logging identifier |
| `serializers` | `Partial<Serializers<K,V,HK,HV>>` | - | Key/value/header serializers |
| `compression` | `CompressionAlgorithmValue` | - | `'none'`, `'gzip'`, `'snappy'`, `'lz4'`, `'zstd'` |
| `acks` | `TKafkaAcks` | - | Acknowledgment level: `0` (none), `1` (leader), `-1` (all) |
| `idempotent` | `boolean` | - | Enable idempotent producer (exactly-once within partition) |
| `transactionalId` | `string` | - | Transactional ID for exactly-once across partitions |
| `strict` | `boolean` | `true` | Strict mode - fail on unknown topics |
| `autocreateTopics` | `boolean` | `false` | Auto-create topics on first produce |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in ms |
| `registry` | `SchemaRegistry` | - | Schema registry for auto ser/deser |
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | - | Called when broker connects |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | - | Called when broker disconnects |

Plus the shared [Connection & Authentication](#connection--authentication) options below, all inherited from `IKafkaConnectionOptions`.

## Connection & Authentication

`IKafkaProducerOptions`, `IKafkaConsumerOptions`, and `IKafkaAdminOptions` all extend `IKafkaConnectionOptions` - this section applies to all three.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | - | Broker addresses (`host:port`). **Required** |
| `clientId` | `string` | - | Unique client identifier. **Required** |
| `retries` | `number` | `3` | Connection retries before failing |
| `retryDelay` | `number` | `1000` | Delay between retries (ms) |
| `sasl` | `SASLOptions` | - | SASL authentication |
| `tls` / `ssl` | `TLSConnectionOptions` | - | TLS options (`ssl` is an alias for `tls`) |
| `connectTimeout` | `number` | - | TCP connection timeout (ms) |
| `requestTimeout` | `number` | - | Kafka request timeout (ms) |

**SASL mechanisms** (`@platformatic/kafka` supports five):

| Mechanism | Use case |
|-----------|----------|
| `PLAIN` | Username/password (pair with `tls` in production) |
| `SCRAM-SHA-256` / `SCRAM-SHA-512` | Challenge-response - password never sent in plaintext |
| `OAUTHBEARER` | Token-based - Azure Event Hubs, Confluent Cloud. `token` accepts a string or an async function that returns one |
| `GSSAPI` | Kerberos authentication |

```typescript
import fs from 'node:fs';
import { KafkaProducerHelper } from '@venizia/ignis-helpers/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['broker1:9093', 'broker2:9093'],
  clientId: 'order-producer',
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'kafka-user', password: 'kafka-password' },
  tls: {
    ca: fs.readFileSync('/path/to/ca.pem'),
    cert: fs.readFileSync('/path/to/client-cert.pem'),
    key: fs.readFileSync('/path/to/client-key.pem'),
  },
  connectTimeout: 30_000,
  requestTimeout: 30_000,
});
```

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
helper.isHealthy();      // true when at least one broker connected
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

## Serialization

`@platformatic/kafka`'s default wire format is `Buffer`. The helpers default the generic types to `string`, but that's a type default only. Pass serializers explicitly, or messages travel as raw `Buffer`.

| Export | Type | Description |
|--------|------|-------------|
| `stringSerializer` / `stringDeserializer` | `Serializer<string>` / `Deserializer<string>` | UTF-8 string <-> `Buffer` |
| `jsonSerializer` / `jsonDeserializer` | `Serializer<T>` / `Deserializer<T>` | `JSON.stringify` / `JSON.parse` + UTF-8 |
| `stringSerializers` / `stringDeserializers` | `Serializers<string,string,string,string>` / `Deserializers<...>` | All four positions (key, value, header key, header value) as string |
| `serializersFrom(s)` / `deserializersFrom(d)` | `<T>(fn) => Serializers<T,T,T,T>` / `<T>(fn) => Deserializers<T,T,T,T>` | Build all four positions from a single serializer/deserializer |

```typescript
import { stringSerializers } from '@platformatic/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: stringSerializers,
});
```

```typescript
import { jsonSerializer, stringSerializer, serializersFrom } from '@platformatic/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
});

await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-123',
    value: { id: '123', status: 'created', amount: 99 },
  }],
});
```

For schema-validated serialization (Avro, Protobuf, JSON Schema), pass a `registry` instead of `serializers` - see [Schema Registry](./schema-registry).

## Compression

`@platformatic/kafka` supports five compression algorithms:

| Algorithm | Value | Description |
|-----------|-------|-------------|
| None | `'none'` | No compression (default) |
| GZIP | `'gzip'` | Good compression ratio, moderate CPU |
| Snappy | `'snappy'` | Fast compression, moderate ratio |
| LZ4 | `'lz4'` | Very fast, good for high-throughput |
| Zstandard | `'zstd'` | Best ratio, moderate CPU |

```typescript
const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: stringSerializers,
  compression: 'zstd',
});

// Override per-send
await helper.getProducer().send({
  messages: [{ topic: 'logs', key: 'l1', value: largePayload }],
  compression: 'lz4',
});
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

If the callback throws, the transaction is automatically aborted and the error re-thrown.

### Transaction Context

The callback receives an `IKafkaTransactionContext`:

| Property | Type | Description |
|----------|------|-------------|
| `transaction` | `Transaction` | The underlying platformatic transaction |
| `send(opts)` | `(opts: SendOptions) => Promise<ProduceResult>` | Send messages within the transaction |
| `addConsumer(consumer)` | `(consumer: Consumer) => Promise<void>` | Add a consumer for exactly-once |
| `addOffset(message)` | `(message: Message) => Promise<void>` | Add consumed message offset to transaction |

## Graceful Shutdown

`close()` runs a two-phase shutdown:

| Phase | When it runs | What happens |
|---|---|---|
| Graceful | Default | Calls `close(true)` on the underlying producer, capped at `shutdownTimeout` (default 30s) |
| Force fallback | Graceful times out | Force-closes automatically, no further waiting |
| Force | `close({ isForce: true })` | Calls `close(true)` immediately, no timeout |

After `close()`, all broker tracking is cleared and `healthStatus` becomes `'disconnected'`.

```typescript
// Graceful (recommended)
await helper.close();

// Force
await helper.close({ isForce: true });
```

## API Reference (`@platformatic/kafka`)

After calling `helper.getProducer()`, you have full access to the `Producer` class.

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

By default, `@platformatic/kafka` uses **murmur2 hashing** on the message key to pick the target partition:

| Key | Target partition |
|---|---|
| Same key, every time | Same partition - ordering is guaranteed per key |
| `undefined` | Round-robin across partitions |
| Explicit `partition` field | That partition, overriding the partitioner |

```typescript
// Custom partitioner
await producer.send({
  messages: [{ topic: 'events', key: 'e1', value: 'data' }],
  partitioner: (message) => {
    return message.key!.charCodeAt(0) % 3;
  },
});
```

## See also

- [Kafka Overview](./) - the four helpers, shared health/close API, and the compile-binary caveat
- [Consumer](./consumer) - the receiving side, including message callbacks and lag monitoring
- [Schema Registry](./schema-registry) - schema-validated serialization instead of manual `serializers`
- [Compiling to a Single Binary](./compile-binary) - required when this helper ships inside a `bun build --compile` binary
- [Examples & Troubleshooting](./examples) - IoC wiring and the common connection-error lookup table

**Files:**

- [`packages/helpers/src/modules/queue/kafka/producer.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/producer.ts) - `KafkaProducerHelper`
- [`packages/helpers/src/modules/queue/kafka/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/base.ts) - `BaseKafkaHelper`, shared health tracking and shutdown
- [`packages/helpers/src/modules/queue/kafka/common/types/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/types) - `IKafkaProducerOptions`, `IKafkaConnectionOptions`, `IKafkaTransactionContext`
