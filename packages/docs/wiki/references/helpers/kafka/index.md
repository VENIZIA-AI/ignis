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

## Pages

- **[Producer](./producer)** — Producer helper setup, usage, and full `@platformatic/kafka` Producer API reference
- **[Consumer](./consumer)** — Consumer helper setup, usage, and full `@platformatic/kafka` Consumer API reference
- **[Admin](./admin)** — Admin helper setup, usage, and full `@platformatic/kafka` Admin API reference
- **[Examples & Troubleshooting](./examples)** — Complete examples, IoC integration, and troubleshooting guide

## See Also

- **Other Helpers:**
  - [Queue Helper](../queue/) — BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) — Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) — Underlying Kafka client library
  - [Apache Kafka Documentation](https://kafka.apache.org/documentation/) — Official Kafka docs
  - [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) — New consumer group protocol
