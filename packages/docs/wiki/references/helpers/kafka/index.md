# Kafka <Badge type="warning" text="Experimental" />

Apache Kafka event streaming with producer, consumer, and admin helpers. Built on [`@platformatic/kafka`](https://github.com/platformatic/kafka).

> [!WARNING]
> This helper is **experimental**. The API may change in future releases.

## Quick Reference

| Class | Extends | Peer Dependency | Use Case |
|-------|---------|-----------------|----------|
| **KafkaProducerHelper** | `BaseHelper` | `@platformatic/kafka` | Publish messages to Kafka topics |
| **KafkaConsumerHelper** | `BaseHelper` | `@platformatic/kafka` | Consume messages from Kafka topics with consumer groups |
| **KafkaAdminHelper** | `BaseHelper` | `@platformatic/kafka` | Manage topics, partitions, and consumer groups |

### Import Path

```typescript
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
  KafkaAdminHelper,
  KafkaDefaults,
  KafkaAcks,
  KafkaGroupProtocol,
} from '@venizia/ignis-helpers/kafka';

import type {
  IKafkaConnectionOptions,
  IKafkaProducerOpts,
  IKafkaConsumerOpts,
  IKafkaAdminOpts,
} from '@venizia/ignis-helpers/kafka';
```

## Installation

```bash
bun add @platformatic/kafka
```

## Design Philosophy

All three Kafka helpers are **thin wrappers** around `@platformatic/kafka`. They provide:

- Scoped logging via `BaseHelper`
- Sensible defaults via `KafkaDefaults`
- Factory pattern (`newInstance()`)
- Lifecycle management (`close()`)

They do **not** re-implement or passthrough `@platformatic/kafka` methods. Use `getProducer()`, `getConsumer()`, or `getAdmin()` to access the full underlying API directly.

## Connection Options

All helpers share a common base interface `IKafkaConnectionOptions` which extends `@platformatic/kafka`'s `ConnectionOptions`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses (required) |
| `clientId` | `string` | -- | Kafka client ID (required) |
| `retries` | `number` | `3` | Connection retries |
| `retryDelay` | `number` | `1000` | Delay between retries in ms |
| `sasl` | `SASLOptions` | -- | SASL authentication (`PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512`, `OAUTHBEARER`) |
| `tls` | `TLSConnectionOptions` | -- | TLS/SSL connection options |
| `ssl` | `TLSConnectionOptions` | -- | Alias for `tls` |
| `connectTimeout` | `number` | -- | Connection timeout in ms |
| `requestTimeout` | `number` | -- | Request timeout in ms |

### SASL Authentication Example

```typescript
const helper = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  sasl: {
    mechanism: 'SCRAM-SHA-512',
    username: 'my-user',
    password: 'my-password',
  },
});
```

## Producer

The `KafkaProducerHelper` wraps `@platformatic/kafka`'s `Producer`. Use `getProducer()` to access the full Producer API.

```typescript
import { KafkaProducerHelper, KafkaAcks } from '@venizia/ignis-helpers/kafka';
import { stringSerializers } from '@platformatic/kafka';

const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'order-producer',
  serializers: stringSerializers,
  acks: KafkaAcks.ALL,
  idempotent: true,
});

const producer = helper.getProducer();

// Send messages
await producer.send({
  messages: [
    { topic: 'orders', key: 'order-123', value: JSON.stringify({ status: 'created' }) },
  ],
});

// Use ProducerStream for high-throughput with auto-batching
const stream = producer.asStream({ batchSize: 100, batchTime: 1000 });
stream.write({ topic: 'events', key: 'e1', value: JSON.stringify({ type: 'click' }) });
await stream.close();

// Graceful shutdown
await helper.close();
```

### IKafkaProducerOpts

Generic: `IKafkaProducerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>` (defaults to `string`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | `'kafka-producer'` | Scoped logging identifier |
| `serializers` | `Partial<Serializers>` | -- | Custom key/value/header serializers |
| `compression` | `CompressionAlgorithmValue` | -- | Compression algorithm (`'gzip'`, `'snappy'`, `'lz4'`, `'zstd'`) |
| `acks` | `TKafkaAcks` | -- | Acknowledgment level (`0`, `1`, `-1`) |
| `idempotent` | `boolean` | -- | Enable idempotent producer |
| `transactionalId` | `string` | -- | Transactional ID for exactly-once semantics |
| `strict` | `boolean` | `true` | Strict mode |
| `autocreateTopics` | `boolean` | `false` | Auto-create topics on first produce |

Plus all [Connection Options](#connection-options).

### Producer API

| Method | Returns | Description |
|--------|---------|-------------|
| `getProducer()` | `Producer<K, V, HK, HV>` | Access the underlying `@platformatic/kafka` Producer |
| `close(isForce?)` | `Promise<void>` | Close the producer (default: `force=false`) |
| `static newInstance(opts)` | `KafkaProducerHelper` | Factory method |

### Generic Types

```typescript
// Default: string serialization
const helper = KafkaProducerHelper.newInstance({ ... });

// Custom: Buffer keys, string values
import { type Serializers } from '@platformatic/kafka';

const helper = KafkaProducerHelper.newInstance<Buffer, string, string, string>({
  serializers: myCustomSerializers,
  ...
});
```

## Consumer

The `KafkaConsumerHelper` wraps `@platformatic/kafka`'s `Consumer`. Use `getConsumer()` to access the full Consumer API — including `consume()`, event listeners, and lag monitoring.

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringDeserializers } from '@platformatic/kafka';

const helper = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'order-consumer',
  groupId: 'order-processing-group',
  deserializers: stringDeserializers,
  autocommit: false,
});

const consumer = helper.getConsumer();

// Start consuming
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'latest',
});

// Option 1: Async iterator
for await (const message of stream) {
  console.log(`${message.topic}:${message.partition} — ${message.key} → ${message.value}`);
  await message.commit();
}

// Option 2: Event-based
stream.on('data', (message) => {
  console.log('Received:', message.value);
  message.commit();
});

// Lag monitoring
consumer.startLagMonitoring({ topics: ['orders'] }, 5000);
consumer.on('consumer:lag', (lag) => console.log('Lag:', lag));

// Graceful shutdown
await stream.close();
await helper.close();
```

### IKafkaConsumerOpts

Generic: `IKafkaConsumerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>` (defaults to `string`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `groupId` | `string` | -- | Consumer group ID (required) |
| `identifier` | `string` | `'kafka-consumer'` | Scoped logging identifier |
| `deserializers` | `Partial<Deserializers>` | -- | Custom key/value/header deserializers |
| `autocommit` | `boolean \| number` | `false` | Auto-commit offsets (or interval in ms) |
| `sessionTimeout` | `number` | `30000` | Session timeout in ms |
| `heartbeatInterval` | `number` | `3000` | Heartbeat interval in ms |
| `rebalanceTimeout` | `number` | `sessionTimeout` | Rebalance timeout in ms |
| `groupProtocol` | `'classic' \| 'consumer'` | `'classic'` | Consumer group protocol |
| `groupInstanceId` | `string` | -- | Static membership instance ID |
| `highWaterMark` | `number` | `1024` | Stream high water mark |
| `minBytes` | `number` | `1` | Min bytes to fetch |
| `maxBytes` | `number` | -- | Max bytes to fetch per partition |
| `maxWaitTime` | `number` | -- | Max wait time for fetch in ms |
| `metadataMaxAge` | `number` | `300000` | Metadata max age in ms |

Plus all [Connection Options](#connection-options).

### Consumer API

| Method | Returns | Description |
|--------|---------|-------------|
| `getConsumer()` | `Consumer<K, V, HK, HV>` | Access the underlying `@platformatic/kafka` Consumer |
| `close(isForce?)` | `Promise<void>` | Close the consumer (default: `force=true`) |
| `static newInstance(opts)` | `KafkaConsumerHelper` | Factory method |

### Manual Commit

When `autocommit` is `false`, each message must be explicitly committed:

```typescript
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

### Consumer Group Partitioning

With multiple consumers sharing the same `groupId`, Kafka distributes partitions across group members. With 3 consumers and a topic with 3 partitions, each consumer gets exactly 1 partition:

```bash
# Terminal 1 — handles partition 0
bun run consumer.ts c1

# Terminal 2 — handles partition 1
bun run consumer.ts c2

# Terminal 3 — handles partition 2
bun run consumer.ts c3
```

## Admin

The `KafkaAdminHelper` wraps `@platformatic/kafka`'s `Admin`. Use `getAdmin()` to access the full Admin API directly.

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

const helper = KafkaAdminHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-admin',
});

const admin = helper.getAdmin();

// Topic management
await admin.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
const topics = await admin.listTopics({ includeInternals: false });
const groups = await admin.describeGroups({ groups: ['my-group'] });

// Cleanup
await helper.close();
```

### IKafkaAdminOpts

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | `'kafka-admin'` | Scoped logging identifier |

Plus all [Connection Options](#connection-options).

### Admin API

| Method | Returns | Description |
|--------|---------|-------------|
| `getAdmin()` | `Admin` | Access the underlying `@platformatic/kafka` Admin |
| `close()` | `Promise<void>` | Close the admin connection |
| `static newInstance(opts)` | `KafkaAdminHelper` | Factory method |

## Constants

### KafkaDefaults

| Constant | Value | Scope | Description |
|----------|-------|-------|-------------|
| `RETRIES` | `3` | Shared | Default connection retries |
| `RETRY_DELAY` | `1000` | Shared | Default retry delay (ms) |
| `STRICT` | `true` | Producer | Strict mode |
| `AUTOCREATE_TOPICS` | `false` | Producer | Auto-create topics |
| `AUTOCOMMIT` | `false` | Consumer | Auto-commit offsets |
| `SESSION_TIMEOUT` | `30000` | Consumer | Session timeout (ms) |
| `HEARTBEAT_INTERVAL` | `3000` | Consumer | Heartbeat interval (ms) |
| `HIGH_WATER_MARK` | `1024` | Consumer | Stream high water mark |
| `MIN_BYTES` | `1` | Consumer | Min bytes to fetch |
| `METADATA_MAX_AGE` | `300000` | Consumer | Metadata max age (ms) |
| `GROUP_PROTOCOL` | `'classic'` | Consumer | Default group protocol |

### KafkaAcks

| Constant | Value | Description |
|----------|-------|-------------|
| `NONE` | `0` | No acknowledgment (fire-and-forget) |
| `LEADER` | `1` | Leader acknowledgment only |
| `ALL` | `-1` | All replicas must acknowledge |

Static methods: `KafkaAcks.isValid(ack)`, `KafkaAcks.SCHEME_SET`

### KafkaGroupProtocol

| Constant | Value | Description |
|----------|-------|-------------|
| `CLASSIC` | `'classic'` | Classic consumer group protocol |
| `CONSUMER` | `'consumer'` | New consumer group protocol (KIP-848) |

Static methods: `KafkaGroupProtocol.isValid(mode)`, `KafkaGroupProtocol.SCHEME_SET`

## See Also

- **Other Helpers:**
  - [Queue Helper](../queue/) -- BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) -- Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) -- Underlying Kafka client library
