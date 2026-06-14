# Kafka

Apache Kafka event streaming with producer, consumer, admin, and schema registry helpers. Built on [`@platformatic/kafka`](https://github.com/platformatic/kafka) v1.30.0 -- a pure TypeScript Kafka client with zero native dependencies.

## Overview

The Kafka module provides four helper classes built on a shared `BaseKafkaHelper` base:

| Class | Wraps | Use Case |
|-------|-------|----------|
| `KafkaProducerHelper` | `Producer` | Publish messages, transactions |
| `KafkaConsumerHelper` | `Consumer` | Consume messages with consumer groups, lag monitoring |
| `KafkaAdminHelper` | `Admin` | Manage topics, partitions, groups, ACLs, configs |
| `KafkaSchemaRegistryHelper` | `ConfluentSchemaRegistry` | Schema validation and auto ser/deser |

All helpers (except schema registry) extend `BaseKafkaHelper` which provides:

- **Scoped logging** via `BaseHelper` (Winston with daily rotation)
- **Health tracking** -- per-broker connection tracking via `isHealthy()`, `isReady()`, `getHealthStatus()`, `getConnectedBrokerCount()`
- **Broker event callbacks** -- `onBrokerConnect`, `onBrokerDisconnect`
- **Broker failure tracking** -- automatic `configureBrokerFailed()` sets status to `'disconnected'` only when all brokers are gone
- **Graceful shutdown** -- timeout-based with force fallback
- **Sensible defaults** via `KafkaDefaults` constants
- **Factory pattern** via `newInstance()` static method

Use `getProducer()`, `getConsumer()`, or `getAdmin()` to access the full underlying `@platformatic/kafka` API directly.

### Import Path

```typescript
// Helpers & constants (via subpath export)
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
  KafkaAdminHelper,
  KafkaSchemaRegistryHelper,
  BaseKafkaHelper,
  KafkaDefaults,
  KafkaAcks,
  KafkaGroupProtocol,
  KafkaHealthStatuses,
  KafkaClientEvents,
} from '@venizia/ignis-helpers/kafka';

// Types
import type {
  IKafkaConnectionOptions,
  IKafkaProducerOptions,
  IKafkaConsumerOptions,
  IKafkaAdminOptions,
  IKafkaConsumeStartOptions,
  IKafkaSchemaRegistryOptions,
  IKafkaTransactionContext,
  IKafkaBaseOptions,
  TKafkaAcks,
  TKafkaGroupProtocol,
  TKafkaHealthStatus,
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
  TKafkaTransactionCallback,
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

> [!NOTE]
> Kafka helpers are **not** re-exported from the main `@venizia/ignis-helpers` entry point. You must use the `@venizia/ignis-helpers/kafka` subpath import. This keeps the optional `@platformatic/kafka` peer dependency isolated for tree-shaking.

### Installation

```bash
bun add @platformatic/kafka
```

## Architecture

### Class Hierarchy

```
BaseHelper (scoped logging, identifier)
  +-- BaseKafkaHelper<TClient> (health tracking, broker events, graceful shutdown)
  |     +-- KafkaProducerHelper<K,V,HK,HV>
  |     +-- KafkaConsumerHelper<K,V,HK,HV>
  |     +-- KafkaAdminHelper
  |
  +-- KafkaSchemaRegistryHelper<K,V,HK,HV>  (no broker connection)
```

### BaseKafkaHelper

All Kafka helpers (except schema registry) extend `BaseKafkaHelper<TClient>`, which provides:

```typescript
abstract class BaseKafkaHelper<TClient extends Base<BaseOptions>> extends BaseHelper {
  // Health
  isHealthy(): boolean;              // true when at least one broker is connected
  isReady(): boolean;                // healthStatus === 'connected' (consumer overrides: + isActive())
  getHealthStatus(): TKafkaHealthStatus;  // 'connected' | 'disconnected' | 'unknown'
  getConnectedBrokerCount(): number; // number of currently connected brokers

  // Shutdown (used by subclasses)
  protected closeClient(): Promise<void>;
  protected gracefulCloseClient(): Promise<void>; // races closeClient vs shutdownTimeout
  protected resetHealthState(): void;             // clears broker tracking + sets 'disconnected'
}
```

Health tracking uses a **per-broker connection set** (`host:port` keys). A single idle broker disconnect does not make the client unhealthy -- only when **all** brokers are disconnected does `isHealthy()` return `false`.

Health status transitions automatically via broker events:
- `client:broker:connect` -> adds broker, sets `healthStatus` to `'connected'`
- `client:broker:disconnect` -> removes broker, sets `healthStatus` to `'disconnected'` only when all brokers are gone
- `client:broker:failed` -> removes broker, sets `healthStatus` to `'disconnected'` only when all brokers are gone
- `close()` -> clears all brokers, sets `healthStatus` to `'disconnected'`

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
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses (`host:port`). **Required** |
| `clientId` | `string` | -- | Unique client identifier. **Required** |
| `retries` | `number` | `3` | Number of connection retries before failing |
| `retryDelay` | `number` | `1000` | Delay between retries in milliseconds |
| `sasl` | `SASLOptions` | -- | SASL authentication configuration |
| `tls` | `TLSConnectionOptions` | -- | TLS/SSL connection options |
| `ssl` | `TLSConnectionOptions` | -- | Alias for `tls` |
| `connectTimeout` | `number` | -- | TCP connection timeout in milliseconds |
| `requestTimeout` | `number` | -- | Kafka request timeout in milliseconds |

### Shared Helper Options

These options are available on all three helpers (`IKafkaProducerOptions`, `IKafkaConsumerOptions`, `IKafkaAdminOptions`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | `'kafka-{type}'` | Scoped logging identifier |
| `shutdownTimeout` | `number` | `30000` | Graceful shutdown timeout in ms |
| `onBrokerConnect` | `TKafkaBrokerEventCallback` | -- | Called when broker connects |
| `onBrokerDisconnect` | `TKafkaBrokerEventCallback` | -- | Called when broker disconnects |

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
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
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

## Serialization & Deserialization

`@platformatic/kafka`'s default wire format is `Buffer`. The helpers default generic types to `string` (matching common usage), but you must provide serializers/deserializers explicitly.

### Built-in Serializers

| Export | Type | Description |
|--------|------|-------------|
| `stringSerializer` | `Serializer<string>` | `string -> Buffer` (UTF-8) |
| `stringDeserializer` | `Deserializer<string>` | `Buffer -> string` (UTF-8) |
| `jsonSerializer` | `Serializer<T>` | `object -> Buffer` (JSON.stringify + UTF-8) |
| `jsonDeserializer` | `Deserializer<T>` | `Buffer -> object` (UTF-8 + JSON.parse) |
| `stringSerializers` | `Serializers<string, string, string, string>` | All four positions as string |
| `stringDeserializers` | `Deserializers<string, string, string, string>` | All four positions as string |

### Helper Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `serializersFrom(s)` | `<T>(s: Serializer<T>) => Serializers<T, T, T, T>` | Create full serializers from a single serializer |
| `deserializersFrom(d)` | `<T>(d: Deserializer<T>) => Deserializers<T, T, T, T>` | Create full deserializers from a single deserializer |

### String Serialization

```typescript
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: stringSerializers,
});

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  deserializers: stringDeserializers,
  onMessage: async ({ message }) => {
    console.log(message.key, message.value); // both strings
  },
});
```

### JSON Serialization

```typescript
import {
  jsonSerializer, jsonDeserializer,
  stringSerializer, stringDeserializer,
  serializersFrom, deserializersFrom,
} from '@platformatic/kafka';

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

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  deserializers: { ...deserializersFrom(jsonDeserializer), key: stringDeserializer },
  onMessage: async ({ message }) => {
    console.log(message.value.id, message.value.status); // typed object
  },
});
```

### Schema Registry Serialization

For schema-validated serialization (Avro, Protobuf, JSON Schema), use the schema registry helper:

```typescript
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
});

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  registry: registry.getRegistry(),
});

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  registry: registry.getRegistry(),
  onMessage: async ({ message }) => {
    // message.value is auto-deserialized using registered schema
  },
});
```

See **[Schema Registry](./schema-registry)** for full documentation.

## Generic Type Parameters

All helpers (and their option interfaces) support generic type parameters controlling the serialization types:

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
```

## Constants

### KafkaDefaults

Centralized default values used by all helpers.

```typescript
import { KafkaDefaults } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Scope | Description |
|----------|-------|-------|-------------|
| `RETRIES` | `3` | Shared | Connection retry count |
| `RETRY_DELAY` | `1000` | Shared | Retry delay in ms |
| `SHUTDOWN_TIMEOUT` | `30000` | Shared | Graceful shutdown timeout in ms |
| `STRICT` | `true` | Producer | Fail on unknown topics |
| `AUTOCREATE_TOPICS` | `false` | Producer | Auto-create topics on produce |
| `AUTOCOMMIT` | `false` | Consumer | Auto-commit offsets |
| `SESSION_TIMEOUT` | `60000` | Consumer | Session timeout in ms |
| `HEARTBEAT_INTERVAL` | `10000` | Consumer | Heartbeat interval in ms |
| `HIGH_WATER_MARK` | `1024` | Consumer | Stream buffer size (messages) |
| `MIN_BYTES` | `1` | Consumer | Min bytes per fetch |
| `METADATA_MAX_AGE` | `300000` | Consumer | Metadata cache TTL in ms |
| `GROUP_PROTOCOL` | `'classic'` | Consumer | Default group protocol |
| `CONSUME_MODE` | `'committed'` | Consumer | Default consume mode |
| `CONSUME_FALLBACK_MODE` | `'latest'` | Consumer | Default consume fallback mode |
| `LAG_MONITOR_INTERVAL` | `30000` | Consumer | Lag monitoring poll interval in ms |

### KafkaHealthStatuses

Health status values used by all Kafka helpers.

```typescript
import { KafkaHealthStatuses } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Description |
|----------|-------|-------------|
| `CONNECTED` | `'connected'` | Broker connection established |
| `DISCONNECTED` | `'disconnected'` | Broker connection lost or closed |
| `UNKNOWN` | `'unknown'` | Initial state before first broker event |

### KafkaClientEvents

Event name constants for `@platformatic/kafka` event emitters.

```typescript
import { KafkaClientEvents } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Scope |
|----------|-------|-------|
| `BROKER_CONNECT` | `'client:broker:connect'` | All clients |
| `BROKER_DISCONNECT` | `'client:broker:disconnect'` | All clients |
| `BROKER_FAILED` | `'client:broker:failed'` | All clients |
| `CONSUMER_GROUP_JOIN` | `'consumer:group:join'` | Consumer |
| `CONSUMER_GROUP_LEAVE` | `'consumer:group:leave'` | Consumer |
| `CONSUMER_GROUP_REBALANCE` | `'consumer:group:rebalance'` | Consumer |
| `CONSUMER_HEARTBEAT_ERROR` | `'consumer:heartbeat:error'` | Consumer |
| `CONSUMER_LAG` | `'consumer:lag'` | Consumer |
| `CONSUMER_LAG_ERROR` | `'consumer:lag:error'` | Consumer |
| `STREAM_DATA` | `'data'` | Stream |
| `STREAM_ERROR` | `'error'` | Stream |

### KafkaAcks

Producer acknowledgment levels.

```typescript
import { KafkaAcks } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Description | Trade-off |
|----------|-------|-------------|-----------|
| `NONE` | `0` | No acknowledgment -- fire-and-forget | Fastest, no durability guarantee |
| `LEADER` | `1` | Leader broker acknowledges | Fast, leader-durable |
| `ALL` | `-1` | All in-sync replicas acknowledge | Slowest, fully durable |

### KafkaGroupProtocol

Consumer group protocol versions.

```typescript
import { KafkaGroupProtocol } from '@venizia/ignis-helpers/kafka';
```

| Constant | Value | Description |
|----------|-------|-------------|
| `CLASSIC` | `'classic'` | Classic consumer group protocol (default, all Kafka versions) |
| `CONSUMER` | `'consumer'` | New consumer group protocol -- KIP-848 (Kafka 3.7+) |

### Derived Types

```typescript
import type { TKafkaAcks, TKafkaGroupProtocol, TKafkaHealthStatus } from '@venizia/ignis-helpers/kafka';

// TKafkaAcks = 0 | 1 | -1
// TKafkaGroupProtocol = 'classic' | 'consumer'
// TKafkaHealthStatus = 'connected' | 'disconnected' | 'unknown'
```

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

## Quick Usage Comparison

### Construction

```typescript
// Admin
const admin = KafkaAdminHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-admin',
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),
});

// Producer
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-producer',
  acks: -1,
  idempotent: true,
  transactionalId: 'my-tx',
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),
});

// Consumer
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),
  onMessage: async ({ message }) => {
    console.log('Received:', message.value);
    await message.commit();
  },
  onMessageDone: ({ message }) => console.log('Done:', message.key),
  onMessageError: ({ error, message }) => console.error('Error:', error),
  onGroupJoin: ({ groupId, memberId }) => console.log(`Joined ${groupId}`),
  onGroupLeave: ({ groupId }) => console.log(`Left ${groupId}`),
  onGroupRebalance: ({ groupId }) => console.log(`Rebalance ${groupId}`),
  onHeartbeatError: ({ error }) => console.error('Heartbeat:', error),
  onLag: ({ lag }) => console.log('Lag:', lag),
  onLagError: ({ error }) => console.error('Lag error:', error),
});
```

### Core Operations

| Admin | Producer | Consumer |
|-------|----------|----------|
| `admin.getAdmin()` | `producer.getProducer()` | `consumer.getConsumer()` |
| -- | `producer.getProducer().send(...)` | `await consumer.start({ topics: ['t1'] })` |
| -- | `await producer.runInTransaction(async ({ send, addConsumer, addOffset }) => { ... })` | `consumer.startLagMonitoring({ topics: ['t1'], interval: 10_000 })` |
| -- | -- | `consumer.stopLagMonitoring()` |
| -- | -- | `consumer.getStream()` |

### Health Checks

```typescript
// All three -- identical API
helper.isHealthy();      // true when at least one broker connected
helper.isReady();        // Admin/Producer: same as isHealthy()
                         // Consumer: isHealthy() + consumer.isActive()
helper.getHealthStatus(); // 'connected' | 'disconnected' | 'unknown'
```

### Shutdown

```typescript
// All three -- identical API
await helper.close();                    // graceful (timeout -> force fallback)
await helper.close({ isForce: true });   // immediate force close
```

### With Schema Registry

```typescript
const registry = KafkaSchemaRegistryHelper.newInstance({ url: 'http://localhost:8081' });

const producer = KafkaProducerHelper.newInstance({
  ...,
  registry: registry.getRegistry(),
  // or use registry.getSerializers() for manual serializer config
});

const consumer = KafkaConsumerHelper.newInstance({
  ...,
  registry: registry.getRegistry(),
  // or use registry.getDeserializers() for manual deserializer config
});
```

### Transaction (Producer Only)

```typescript
const result = await producer.runInTransaction(async ({ send, addConsumer, addOffset }) => {
  // Send messages within transaction
  const result = await send({
    messages: [{ topic: 'orders', key: 'o1', value: '{"status":"created"}' }],
  });

  // Optionally add consumer for exactly-once semantics
  await addConsumer(consumer.getConsumer());
  await addOffset(message);

  return result;
});
```

## Pages

- **[Producer](./producer)** -- Producer helper, transactions, and full `@platformatic/kafka` Producer API reference
- **[Consumer](./consumer)** -- Consumer helper, message callbacks, lag monitoring, and full Consumer API reference
- **[Admin](./admin)** -- Admin helper and full Admin API reference
- **[Schema Registry](./schema-registry)** -- Schema registry helper for Avro/Protobuf/JSON Schema validation
- **[Examples & Troubleshooting](./examples)** -- Complete examples, IoC integration, and troubleshooting guide

## See Also

- **Other Helpers:**
  - [Queue Helper](../queue/) -- BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) -- Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) -- Underlying Kafka client library
  - [Apache Kafka Documentation](https://kafka.apache.org/documentation/) -- Official Kafka docs
  - [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) -- New consumer group protocol
