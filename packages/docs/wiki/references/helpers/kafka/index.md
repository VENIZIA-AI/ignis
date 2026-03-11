# Kafka

Apache Kafka event streaming with producer, consumer, and admin helpers. Built on [`@platformatic/kafka`](https://github.com/platformatic/kafka) v1.30.0 — a pure TypeScript Kafka client with zero native dependencies.

## Overview

The Kafka module provides three **thin wrapper** classes around `@platformatic/kafka`:

| Class | Wraps | Use Case |
|-------|-------|----------|
| `KafkaProducerHelper` | `Producer` | Publish messages to Kafka topics |
| `KafkaConsumerHelper` | `Consumer` | Consume messages with consumer groups |
| `KafkaAdminHelper` | `Admin` | Manage topics, partitions, groups, ACLs, configs |

Each helper provides:
- **Scoped logging** via `BaseHelper` (Winston with daily rotation)
- **Sensible defaults** via `KafkaDefaults` constants
- **Factory pattern** via `newInstance()` static method
- **Lifecycle management** via `close()` method

They do **not** re-implement or passthrough `@platformatic/kafka` methods. Use `getProducer()`, `getConsumer()`, or `getAdmin()` to access the full underlying API directly.

### Import Path

```typescript
// Helpers & constants
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
  KafkaAdminHelper,
  KafkaDefaults,
  KafkaAcks,
  KafkaGroupProtocol,
} from '@venizia/ignis-helpers/kafka';

// Types
import type {
  IKafkaConnectionOptions,
  IKafkaProducerOpts,
  IKafkaConsumerOpts,
  IKafkaAdminOpts,
  TKafkaAcks,
  TKafkaGroupProtocol,
} from '@venizia/ignis-helpers/kafka';

// @platformatic/kafka (direct usage)
import {
  Producer, Consumer, Admin, MessagesStream,
  stringSerializers, stringDeserializers,
  stringSerializer, stringDeserializer,
  jsonSerializer, jsonDeserializer,
  serializersFrom, deserializersFrom,
} from '@platformatic/kafka';

import type {
  Message, MessageToProduce,
  SendOptions, ConsumeOptions,
  Serializers, Deserializers,
  SASLOptions, ConnectionOptions,
} from '@platformatic/kafka';
```

### Installation

```bash
bun add @platformatic/kafka
```

---

## Connection Options

All three helpers share a common base interface `IKafkaConnectionOptions` which extends `@platformatic/kafka`'s `ConnectionOptions`.

```typescript
interface IKafkaConnectionOptions extends ConnectionOptions {
  bootstrapBrokers: string[];
  clientId: string;
  retries?: number;    // Default: 3
  retryDelay?: number; // Default: 1000ms
}
```

### Full Options Table

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | — | Kafka broker addresses (`host:port`). **Required** |
| `clientId` | `string` | — | Unique client identifier. **Required** |
| `retries` | `number` | `3` | Number of connection retries before failing |
| `retryDelay` | `number` | `1000` | Delay between retries in milliseconds |
| `sasl` | `SASLOptions` | — | SASL authentication configuration |
| `tls` | `TLSConnectionOptions` | — | TLS/SSL connection options |
| `ssl` | `TLSConnectionOptions` | — | Alias for `tls` |
| `connectTimeout` | `number` | — | TCP connection timeout in milliseconds |
| `requestTimeout` | `number` | — | Kafka request timeout in milliseconds |

### SASL Authentication

`@platformatic/kafka` supports five SASL mechanisms:

| Mechanism | Use Case |
|-----------|----------|
| `PLAIN` | Simple username/password (use with TLS in production) |
| `SCRAM-SHA-256` | Challenge-response, password never sent in plaintext |
| `SCRAM-SHA-512` | Same as SHA-256 with stronger hash |
| `OAUTHBEARER` | Token-based (Azure Event Hubs, Confluent Cloud) |
| `GSSAPI` | Kerberos authentication |

```typescript
interface SASLOptions {
  mechanism: 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512' | 'OAUTHBEARER' | 'GSSAPI';
  username?: string | CredentialProvider;
  password?: string | CredentialProvider;
  token?: string | CredentialProvider;
  oauthBearerExtensions?: Record<string, string> | CredentialProvider<Record<string, string>>;
  authenticate?: SASLCustomAuthenticator;
}
```

#### SCRAM-SHA-512 Example

```typescript
const helper = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  sasl: {
    mechanism: 'SCRAM-SHA-512',
    username: 'kafka-user',
    password: 'kafka-password',
  },
  connectTimeout: 30_000,
  requestTimeout: 30_000,
});
```

#### OAUTHBEARER Example

```typescript
const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['pkc-xxxxx.us-west-2.aws.confluent.cloud:9092'],
  clientId: 'my-producer',
  sasl: {
    mechanism: 'OAUTHBEARER',
    token: async () => {
      const response = await fetch('https://auth.example.com/token', { method: 'POST' });
      const { access_token } = await response.json();
      return access_token;
    },
  },
  tls: true,
});
```

#### TLS Without SASL

```typescript
const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['broker:9093'],
  clientId: 'my-producer',
  tls: {
    ca: fs.readFileSync('/path/to/ca.pem'),
    cert: fs.readFileSync('/path/to/client-cert.pem'),
    key: fs.readFileSync('/path/to/client-key.pem'),
  },
});
```

---

## Serialization & Deserialization

`@platformatic/kafka`'s default wire format is `Buffer`. The helpers default generic types to `string` (matching common usage), but you must provide serializers/deserializers explicitly.

### Built-in Serializers

| Export | Type | Description |
|--------|------|-------------|
| `stringSerializer` | `Serializer<string>` | `string → Buffer` (UTF-8) |
| `stringDeserializer` | `Deserializer<string>` | `Buffer → string` (UTF-8) |
| `jsonSerializer` | `Serializer<T>` | `object → Buffer` (JSON.stringify + UTF-8) |
| `jsonDeserializer` | `Deserializer<T>` | `Buffer → object` (UTF-8 + JSON.parse) |
| `stringSerializers` | `Serializers<string, string, string, string>` | All four positions as string |
| `stringDeserializers` | `Deserializers<string, string, string, string>` | All four positions as string |

### Helper Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `serializersFrom(s)` | `<T>(s: Serializer<T>) => Serializers<T, T, T, T>` | Create full serializers from a single serializer |
| `deserializersFrom(d)` | `<T>(d: Deserializer<T>) => Deserializers<T, T, T, T>` | Create full deserializers from a single deserializer |

### Serializers/Deserializers Interface

```typescript
interface Serializers<Key, Value, HeaderKey, HeaderValue> {
  key: SerializerWithHeaders<Key, HeaderKey, HeaderValue>;
  value: SerializerWithHeaders<Value, HeaderKey, HeaderValue>;
  headerKey: Serializer<HeaderKey>;
  headerValue: Serializer<HeaderValue>;
}

interface Deserializers<Key, Value, HeaderKey, HeaderValue> {
  key: DeserializerWithHeaders<Key, HeaderKey, HeaderValue>;
  value: DeserializerWithHeaders<Value, HeaderKey, HeaderValue>;
  headerKey: Deserializer<HeaderKey>;
  headerValue: Deserializer<HeaderValue>;
}
```

### String Serialization

The simplest approach — all keys, values, and headers are strings:

```typescript
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

// Producer
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: stringSerializers,
});

// Consumer
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  deserializers: stringDeserializers,
});
```

### JSON Serialization

For structured data — serialize objects as JSON:

```typescript
import {
  jsonSerializer, jsonDeserializer,
  stringSerializer, stringDeserializer,
  serializersFrom, deserializersFrom,
} from '@platformatic/kafka';

// JSON values with string keys
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
});

const p = producer.getProducer();
await p.send({
  messages: [{
    topic: 'orders',
    key: 'order-123',                                    // string key
    value: { id: '123', status: 'created', amount: 99 }, // object value → auto-serialized to JSON
  }],
});

// Consumer with matching deserializers
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  deserializers: { ...deserializersFrom(jsonDeserializer), key: stringDeserializer },
});
```

### Custom Serialization

For advanced use cases (Avro, Protobuf, MessagePack):

```typescript
import type { Serializer, Deserializer } from '@platformatic/kafka';
import * as msgpack from '@msgpack/msgpack';

const msgpackSerializer: Serializer<unknown> = (data) => {
  if (data === undefined) return undefined;
  return Buffer.from(msgpack.encode(data));
};

const msgpackDeserializer: Deserializer<unknown> = (data) => {
  if (!data) return undefined;
  return msgpack.decode(data);
};

const producer = KafkaProducerHelper.newInstance<string, unknown, string, string>({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'msgpack-producer',
  serializers: {
    key: stringSerializer,
    value: msgpackSerializer,
    headerKey: stringSerializer,
    headerValue: stringSerializer,
  },
});
```

---

## Generic Type Parameters

All three helpers (and their option interfaces) support generic type parameters controlling the serialization types:

```typescript
class KafkaProducerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
>
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `KeyType` | `string` | Message key type after serialization/deserialization |
| `ValueType` | `string` | Message value type after serialization/deserialization |
| `HeaderKeyType` | `string` | Header key type |
| `HeaderValueType` | `string` | Header value type |

> [!NOTE]
> `@platformatic/kafka` defaults to `Buffer` for all four positions. The helpers default to `string` which is more common for application code. If you don't pass serializers, your messages will be sent/received as `Buffer`.

```typescript
// Default: string types (most common)
const helper = KafkaProducerHelper.newInstance({ ... });

// Custom: string keys, JSON object values
const helper = KafkaProducerHelper.newInstance<string, MyEvent, string, string>({
  serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
  ...
});

// Custom: Buffer keys, Buffer values (raw wire format)
const helper = KafkaProducerHelper.newInstance<Buffer, Buffer, Buffer, Buffer>({
  // No serializers needed — @platformatic/kafka defaults to Buffer
  ...
});
```

---

## Producer

### KafkaProducerHelper

Thin wrapper around `@platformatic/kafka`'s `Producer`. Manages creation, logging, and lifecycle.

```typescript
class KafkaProducerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper
```

#### Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaProducerHelper<K,V,HK,HV>` | Factory method |
| `getProducer()` | `(): Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>` | Access the underlying `Producer` |
| `close(isForce?)` | `(isForce?: boolean): Promise<void>` | Close the producer. Default: `force=false` |

#### IKafkaProducerOpts

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

Plus all [Connection Options](#connection-options).

#### Basic Example

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

### Producer API (`@platformatic/kafka`)

After calling `helper.getProducer()`, you have full access to the `Producer` class:

#### `producer.send(options)`

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

#### `producer.asStream(options)`

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

#### `producer.beginTransaction(options?)`

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

#### `producer.close(force?)`

Close the producer connection.

- `force=false` (default): Wait for in-flight requests to complete
- `force=true`: Abort immediately

#### Producer Properties

| Property | Type | Description |
|----------|------|-------------|
| `producerId` | `bigint \| undefined` | Assigned producer ID (after idempotent init) |
| `producerEpoch` | `number \| undefined` | Producer epoch (fencing) |
| `transaction` | `Transaction \| undefined` | Active transaction (if any) |
| `coordinatorId` | `number` | Transaction coordinator broker ID |
| `streamsCount` | `number` | Number of active producer streams |

### Key Partitioning

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

---

## Consumer

### KafkaConsumerHelper

Thin wrapper around `@platformatic/kafka`'s `Consumer`. Manages creation, logging, and lifecycle.

```typescript
class KafkaConsumerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper
```

#### Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaConsumerHelper<K,V,HK,HV>` | Factory method |
| `getConsumer()` | `(): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>` | Access the underlying `Consumer` |
| `close(isForce?)` | `(isForce?: boolean): Promise<void>` | Close the consumer. Default: `force=true` |

> [!NOTE]
> Consumer defaults to `force=true` on close (unlike producer which defaults to `false`). This is because consumers should leave the group promptly to trigger faster rebalancing.

#### IKafkaConsumerOpts

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

Plus all [Connection Options](#connection-options).

#### Basic Example

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

### Consumer API (`@platformatic/kafka`)

After calling `helper.getConsumer()`, you have full access to the `Consumer` class.

#### `consumer.consume(options)`

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

##### Stream Modes

| Mode | Description |
|------|-------------|
| `'committed'` | Resume from last committed offset. **Recommended for production** |
| `'latest'` | Start from the latest offset (skip existing messages) |
| `'earliest'` | Start from the beginning of the topic |
| `'manual'` | Start from explicitly provided offsets via `offsets` option |

##### Fallback Modes

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

### MessagesStream

`MessagesStream` extends Node.js `Readable`. It supports three consumption patterns:

#### Pattern 1: Async Iterator (`for await`)

Best for sequential processing with backpressure:

```typescript
const stream = await consumer.consume({ topics: ['orders'], mode: 'committed', fallbackMode: 'latest' });

for await (const message of stream) {
  await processMessage(message);
  await message.commit();
}
```

#### Pattern 2: Event-Based (`.on('data')`)

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

#### Pattern 3: Pause/Resume

Manual flow control:

```typescript
stream.on('data', async (message) => {
  stream.pause();
  await heavyProcessing(message);
  message.commit();
  stream.resume();
});
```

#### Message Object

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

#### Stream Events

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

#### Stream Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `close()` | `Promise<void>` | Close the stream and leave the consumer group |
| `isActive()` | `boolean` | Whether the stream is actively consuming |
| `isConnected()` | `boolean` | Whether the underlying connection is active |
| `pause()` | `this` | Pause consumption (stop fetching) |
| `resume()` | `this` | Resume consumption |
| `[Symbol.asyncIterator]()` | `AsyncIterator<Message>` | Async iteration support |

#### Stream Properties

| Property | Type | Description |
|----------|------|-------------|
| `consumer` | `Consumer` | Reference to the parent consumer |
| `offsetsToFetch` | `Map<string, bigint>` | Next offsets to fetch per topic-partition |
| `offsetsToCommit` | `Map<string, CommitOptionsPartition>` | Pending commit offsets |
| `offsetsCommitted` | `Map<string, bigint>` | Last committed offsets |
| `committedOffsets` | `Map<string, bigint>` | Alias for `offsetsCommitted` |

### Consumer Offset Management

#### Manual Commit

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

#### Auto-Commit

Commit offsets automatically at a configurable interval:

```typescript
const helper = KafkaConsumerHelper.newInstance({
  // ...
  autocommit: true,      // Default interval
  // autocommit: 5000,   // Custom: commit every 5 seconds
});
```

#### Bulk Commit via Consumer

```typescript
await consumer.commit({
  offsets: [
    { topic: 'orders', partition: 0, offset: 150n, leaderEpoch: 0 },
    { topic: 'orders', partition: 1, offset: 300n, leaderEpoch: 0 },
  ],
});
```

#### List Offsets

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

### Consumer Lag Monitoring

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

### Consumer Events

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

### Consumer Group Management

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

### Consumer Group Partitioning

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

---

## Admin

### KafkaAdminHelper

Thin wrapper around `@platformatic/kafka`'s `Admin`. Manages creation, logging, and lifecycle.

```typescript
class KafkaAdminHelper extends BaseHelper
```

> [!NOTE]
> `KafkaAdminHelper` has **no generic type parameters** — the Admin client does not deal with serialized messages.

#### Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance(opts): KafkaAdminHelper` | Factory method |
| `getAdmin()` | `(): Admin` | Access the underlying `Admin` |
| `close()` | `(): Promise<void>` | Close the admin connection |

#### IKafkaAdminOpts

```typescript
interface IKafkaAdminOpts extends IKafkaConnectionOptions {
  identifier?: string; // Default: 'kafka-admin'
}
```

Plus all [Connection Options](#connection-options).

#### Basic Example

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

const helper = KafkaAdminHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-admin',
});

const admin = helper.getAdmin();

// Create a topic with 3 partitions and 2 replicas
await admin.createTopics({ topics: ['orders'], partitions: 3, replicas: 2 });

// List all topics
const topics = await admin.listTopics();

// Describe a consumer group
const groups = await admin.describeGroups({ groups: ['order-processing'] });

await helper.close();
```

### Admin API (`@platformatic/kafka`)

After calling `helper.getAdmin()`, you have full access to the `Admin` class.

#### Topic Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `createTopics(opts)` | `(opts: { topics: string[], partitions?: number, replicas?: number, configs?: Config[] }): Promise<CreatedTopic[]>` | Create topics |
| `deleteTopics(opts)` | `(opts: { topics: string[] }): Promise<void>` | Delete topics |
| `listTopics(opts?)` | `(opts?: { includeInternals?: boolean }): Promise<string[]>` | List all topics |
| `createPartitions(opts)` | `(opts: { topics: CreatePartitionsRequestTopic[], validateOnly?: boolean }): Promise<void>` | Add partitions to existing topics |
| `deleteRecords(opts)` | `(opts: { topics: { name, partitions: { partition, offset }[] }[] }): Promise<DeletedRecordsTopic[]>` | Delete records up to offset |

```typescript
// Create with custom configuration
await admin.createTopics({
  topics: ['orders'],
  partitions: 6,
  replicas: 3,
  configs: [
    { name: 'retention.ms', value: '604800000' },   // 7 days
    { name: 'cleanup.policy', value: 'compact' },
    { name: 'compression.type', value: 'zstd' },
  ],
});

// Add partitions (can only increase, never decrease)
await admin.createPartitions({
  topics: [{ name: 'orders', count: 12 }],
});

// Delete records before offset 1000 on partition 0
await admin.deleteRecords({
  topics: [{ name: 'orders', partitions: [{ partition: 0, offset: 1000n }] }],
});
```

#### Consumer Group Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `listGroups(opts?)` | `(opts?: { states?: string[], types?: string[] }): Promise<Map<string, GroupBase>>` | List consumer groups |
| `describeGroups(opts)` | `(opts: { groups: string[] }): Promise<Map<string, Group>>` | Describe consumer groups (members, assignments) |
| `deleteGroups(opts)` | `(opts: { groups: string[] }): Promise<void>` | Delete consumer groups |
| `removeMembersFromConsumerGroup(opts)` | `(opts: { groupId, members? }): Promise<void>` | Remove specific members |

```typescript
// List all active groups
const groups = await admin.listGroups({ states: ['STABLE'] });

// Describe group members and partition assignments
const details = await admin.describeGroups({ groups: ['order-processing'] });
for (const [groupId, group] of details) {
  console.log(`Group: ${groupId}, State: ${group.state}`);
  for (const [memberId, member] of group.members) {
    console.log(`  Member: ${member.clientId} (${member.clientHost})`);
    if (member.assignments) {
      for (const [topic, assignment] of member.assignments) {
        console.log(`    ${topic}: partitions ${assignment.partitions.join(', ')}`);
      }
    }
  }
}
```

#### Offset Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `listOffsets(opts)` | `(opts): Promise<ListedOffsetsTopic[]>` | List partition offsets at timestamps |
| `listConsumerGroupOffsets(opts)` | `(opts: { groups }): Promise<ListConsumerGroupOffsetsGroup[]>` | List committed offsets for groups |
| `alterConsumerGroupOffsets(opts)` | `(opts: { groupId, topics }): Promise<void>` | Reset/alter committed offsets |
| `deleteConsumerGroupOffsets(opts)` | `(opts: { groupId, topics }): Promise<...>` | Delete committed offsets |

```typescript
// Reset consumer group offsets to earliest
await admin.alterConsumerGroupOffsets({
  groupId: 'order-processing',
  topics: [{
    name: 'orders',
    partitionOffsets: [
      { partition: 0, offset: 0n },
      { partition: 1, offset: 0n },
      { partition: 2, offset: 0n },
    ],
  }],
});
```

#### Configuration Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `describeConfigs(opts)` | `(opts: { resources, includeSynonyms?, includeDocumentation? }): Promise<ConfigDescription[]>` | Describe broker/topic configurations |
| `alterConfigs(opts)` | `(opts: { resources, validateOnly? }): Promise<void>` | Replace topic/broker configs |
| `incrementalAlterConfigs(opts)` | `(opts: { resources, validateOnly? }): Promise<void>` | Incrementally modify configs |

#### ACL Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `createAcls(opts)` | `(opts: { creations: Acl[] }): Promise<void>` | Create access control lists |
| `describeAcls(opts)` | `(opts: { filter: AclFilter }): Promise<DescribeAclsResponseResource[]>` | Describe ACLs |
| `deleteAcls(opts)` | `(opts: { filters: AclFilter[] }): Promise<Acl[]>` | Delete ACLs |

#### Quota Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `describeClientQuotas(opts)` | `(opts): Promise<DescribeClientQuotasResponseEntry[]>` | Describe client quotas |
| `alterClientQuotas(opts)` | `(opts): Promise<AlterClientQuotasResponseEntries[]>` | Alter client quotas |

#### Log Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `describeLogDirs(opts)` | `(opts: { topics }): Promise<BrokerLogDirDescription[]>` | Describe broker log directories |

---

## Constants

### KafkaDefaults

Centralized default values used by all three helpers.

```typescript
import { KafkaDefaults } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Scope | Used By | Description |
|----------|-------|-------|---------|-------------|
| `RETRIES` | `3` | Shared | All helpers | Connection retry count |
| `RETRY_DELAY` | `1000` | Shared | All helpers | Retry delay in ms |
| `STRICT` | `true` | Producer | `KafkaProducerHelper` | Fail on unknown topics |
| `AUTOCREATE_TOPICS` | `false` | Producer | `KafkaProducerHelper` | Auto-create topics on produce |
| `AUTOCOMMIT` | `false` | Consumer | `KafkaConsumerHelper` | Auto-commit offsets |
| `SESSION_TIMEOUT` | `30000` | Consumer | `KafkaConsumerHelper` | Session timeout in ms |
| `HEARTBEAT_INTERVAL` | `3000` | Consumer | `KafkaConsumerHelper` | Heartbeat interval in ms |
| `HIGH_WATER_MARK` | `1024` | Consumer | `KafkaConsumerHelper` | Stream buffer size (messages) |
| `MIN_BYTES` | `1` | Consumer | `KafkaConsumerHelper` | Min bytes per fetch |
| `METADATA_MAX_AGE` | `300000` | Consumer | `KafkaConsumerHelper` | Metadata cache TTL in ms |
| `GROUP_PROTOCOL` | `'classic'` | Consumer | `KafkaConsumerHelper` | Default group protocol |

### KafkaAcks

Producer acknowledgment levels.

```typescript
import { KafkaAcks } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Description | Trade-off |
|----------|-------|-------------|-----------|
| `NONE` | `0` | No acknowledgment — fire-and-forget | Fastest, no durability guarantee |
| `LEADER` | `1` | Leader broker acknowledges | Fast, leader-durable |
| `ALL` | `-1` | All in-sync replicas acknowledge | Slowest, fully durable |

**Static methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `isValid(ack)` | `(ack: number): boolean` | Check if value is a valid ack level |
| `SCHEME_SET` | `Set<number>` | Set of valid values: `{0, 1, -1}` |

```typescript
KafkaAcks.ALL;           // -1
KafkaAcks.isValid(-1);   // true
KafkaAcks.isValid(2);    // false
KafkaAcks.SCHEME_SET;    // Set { 0, 1, -1 }
```

### KafkaGroupProtocol

Consumer group protocol versions.

```typescript
import { KafkaGroupProtocol } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Description |
|----------|-------|-------------|
| `CLASSIC` | `'classic'` | Classic consumer group protocol (default, all Kafka versions) |
| `CONSUMER` | `'consumer'` | New consumer group protocol — KIP-848 (Kafka 3.7+) |

**Static methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `isValid(mode)` | `(mode: string): boolean` | Check if value is a valid protocol |
| `SCHEME_SET` | `Set<string>` | Set of valid values: `{'classic', 'consumer'}` |

```typescript
KafkaGroupProtocol.CLASSIC;            // 'classic'
KafkaGroupProtocol.isValid('classic');  // true
KafkaGroupProtocol.isValid('foo');      // false
```

### Derived Types

```typescript
import type { TKafkaAcks, TKafkaGroupProtocol } from '@venizia/ignis-helpers/kafka';

// TKafkaAcks = 0 | 1 | -1
// TKafkaGroupProtocol = 'classic' | 'consumer'
```

These union types are derived using `TConstValue<T>` from the constant classes.

---

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
  compression: 'zstd', // Applied to all messages by default
});

// Override per-send
const producer = helper.getProducer();
await producer.send({
  messages: [{ topic: 'logs', key: 'l1', value: largePayload }],
  compression: 'lz4',
});
```

---

## Complete Examples

### Producer: Interval-Based Message Sending

```typescript
import { Producer, serializersFrom, jsonSerializer, stringSerializer } from '@platformatic/kafka';

const producer = new Producer({
  clientId: 'interval-producer',
  bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
  serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'user', password: 'pass' },
  connectTimeout: 30_000,
  requestTimeout: 30_000,
});

let count = 0;
const interval = setInterval(async () => {
  const key = `key-${count % 3}`;
  const value = { index: count, timestamp: new Date().toISOString() };

  await producer.send({ messages: [{ topic: 'events', key, value }] });
  console.log(JSON.stringify({ topic: 'events', key, value }));
  count++;
}, 100);

process.on('SIGINT', async () => {
  clearInterval(interval);
  console.log(`Shutting down... (sent ${count} messages)`);
  await producer.close();
  process.exit(0);
});
```

### Consumer: Event-Based with Manual Commit

```typescript
import { Consumer, deserializersFrom, jsonDeserializer, stringDeserializer } from '@platformatic/kafka';

const consumer = new Consumer({
  clientId: 'event-consumer',
  bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
  groupId: 'processing-group',
  deserializers: { ...deserializersFrom(jsonDeserializer), key: stringDeserializer },
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'user', password: 'pass' },
  connectTimeout: 30_000,
  requestTimeout: 30_000,
  autocommit: false,
});

const stream = await consumer.consume({
  topics: ['events'],
  mode: 'committed',
  fallbackMode: 'latest',
});

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

stream.on('error', (err) => console.error('Stream error:', err));

process.on('SIGINT', async () => {
  await stream.close();
  await consumer.close();
  process.exit(0);
});
```

### Admin: Topic Setup Script

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

async function setupTopics() {
  const helper = KafkaAdminHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'topic-setup',
  });

  const admin = helper.getAdmin();

  // Create topics
  await admin.createTopics({
    topics: ['orders', 'inventory', 'notifications'],
    partitions: 6,
    replicas: 3,
    configs: [
      { name: 'retention.ms', value: '604800000' },
      { name: 'compression.type', value: 'zstd' },
    ],
  });

  // Verify
  const topics = await admin.listTopics({ includeInternals: false });
  console.log('Topics:', topics);

  await helper.close();
}

setupTopics();
```

### Using Helpers with Ignis IoC

```typescript
import { KafkaProducerHelper, KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';
import { inject, injectable } from '@venizia/ignis-inversion';

@injectable()
export class OrderEventService {
  private producer: KafkaProducerHelper;
  private consumer: KafkaConsumerHelper;

  constructor(
    @inject({ key: 'kafka.producer' }) producer: KafkaProducerHelper,
    @inject({ key: 'kafka.consumer' }) consumer: KafkaConsumerHelper,
  ) {
    this.producer = producer;
    this.consumer = consumer;
  }

  async publishOrderCreated(orderId: string, data: Record<string, unknown>) {
    const producer = this.producer.getProducer();
    await producer.send({
      messages: [{ topic: 'order-events', key: orderId, value: JSON.stringify(data) }],
    });
  }

  async startConsuming() {
    const consumer = this.consumer.getConsumer();
    const stream = await consumer.consume({
      topics: ['order-events'],
      mode: 'committed',
      fallbackMode: 'latest',
    });

    for await (const message of stream) {
      await this.handleOrderEvent(message.key!, JSON.parse(message.value!));
      await message.commit();
    }
  }

  private async handleOrderEvent(orderId: string, data: Record<string, unknown>) {
    // Process order event
  }
}

// Register in application
app.bind('kafka.producer').to(
  KafkaProducerHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'order-service-producer',
    serializers: stringSerializers,
  }),
);

app.bind('kafka.consumer').to(
  KafkaConsumerHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'order-service-consumer',
    groupId: 'order-service',
    deserializers: stringDeserializers,
  }),
);
```

---

## Troubleshooting

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED localhost:9092` | Broker `advertised.listeners` set to `localhost` but connecting remotely | Set `KAFKA_ADVERTISED_LISTENERS` with the correct external host IP |
| `Request timed out` | SASL handshake or broker unreachable | Add `connectTimeout: 30_000, requestTimeout: 30_000` |
| `Connection closed` | Connecting without SASL to a SASL-required listener | Check `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` — use `SASL_PLAINTEXT` |
| `Cannot find a suitable SASL mechanism` | Wrong mechanism (e.g., `PLAIN` when broker only supports `SCRAM-SHA-512`) | Check error message for supported mechanisms, match `mechanism` |
| `Failed to deserialize a message` | Mismatch between serializer used for producing and deserializer used for consuming | Ensure matching serde. For old data, use a new consumer group or recreate topic |
| `JSON.stringify cannot serialize BigInt` | `message.offset` and `message.timestamp` are `bigint` | Use custom replacer: `(_k, v) => typeof v === 'bigint' ? v.toString() : v` |
| Consumer idle (no messages) | More consumers than partitions | Ensure `numPartitions >= numConsumers` |

### Docker Kafka Configuration

When running Kafka in Docker and connecting from outside the container:

```yaml
environment:
  DOCKER_HOST_IP: '192.168.1.100'  # Your host machine's IP
  KAFKA_ADVERTISED_LISTENERS: >
    INTERNAL://kafka-1:29092,
    EXTERNAL://${DOCKER_HOST_IP}:19092
  KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: >
    INTERNAL:PLAINTEXT,
    EXTERNAL:SASL_PLAINTEXT,
    CONTROLLER:PLAINTEXT
```

- `INTERNAL` — used for inter-broker communication
- `EXTERNAL` — used for client connections from outside Docker
- `CONTROLLER` — used for KRaft controller communication

---

## See Also

- **Other Helpers:**
  - [Queue Helper](../queue/) — BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) — Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) — Underlying Kafka client library
  - [Apache Kafka Documentation](https://kafka.apache.org/documentation/) — Official Kafka docs
  - [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) — New consumer group protocol
