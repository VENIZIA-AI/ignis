---
title: Kafka
description: Apache Kafka producer, consumer, admin, and schema registry helpers built on a pure TypeScript client
difficulty: intermediate
---

# Kafka

The Kafka helpers wrap `@platformatic/kafka` with four scoped classes - producer, consumer, admin, and schema registry - that add health tracking, graceful shutdown, and IGNIS-style scoped logging on top of the underlying client.

## In one example

The smallest real use: create a producer, send a message through the underlying client, and close it.

```typescript
import { KafkaProducerHelper } from '@venizia/ignis-helpers/kafka';
import { stringSerializers } from '@platformatic/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'order-producer',
  serializers: stringSerializers,
});

await producer.getProducer().send({
  messages: [{ topic: 'orders', key: 'order-1', value: JSON.stringify({ status: 'created' }) }],
});

await producer.close();
```

`getProducer()` returns the full `@platformatic/kafka` `Producer`. Every helper follows this same pattern: construct through `newInstance()`, reach the native client through `getProducer()` / `getConsumer()` / `getAdmin()`, close through the helper.

## How it works

- **Four helpers, one job each.**

  | Class | Wraps | Use case |
  |---|---|---|
  | `KafkaProducerHelper` | `Producer` | Publish messages, run transactions |
  | `KafkaConsumerHelper` | `Consumer` | Consume via consumer groups, monitor lag |
  | `KafkaAdminHelper` | `Admin` | Manage topics, partitions, groups, ACLs, configs |
  | `KafkaSchemaRegistryHelper` | `ConfluentSchemaRegistry` | Schema-validated serialization (Avro/Protobuf/JSON Schema) |

- **The three connected helpers share an identical health & close API**, regardless of which client they wrap:

  ```typescript
  const producer = KafkaProducerHelper.newInstance({ bootstrapBrokers, clientId });
  const consumer = KafkaConsumerHelper.newInstance({ bootstrapBrokers, clientId, groupId });
  const admin = KafkaAdminHelper.newInstance({ bootstrapBrokers, clientId });

  producer.isHealthy();     // true once at least one broker is connected
  consumer.isReady();       // true once connected AND consumer.isActive()
  admin.getHealthStatus();  // 'connected' | 'disconnected' | 'unknown'

  await Promise.all([producer.close(), consumer.close(), admin.close()]); // graceful, force fallback
  ```

  ```
  BaseHelper (scoped logging, identifier)
    +-- BaseKafkaHelper<TClient> (health tracking, broker events, graceful shutdown)
    |     +-- KafkaProducerHelper<K,V,HK,HV>
    |     +-- KafkaConsumerHelper<K,V,HK,HV>
    |     +-- KafkaAdminHelper
    |
    +-- KafkaSchemaRegistryHelper<K,V,HK,HV>  (no broker connection)
  ```

- **`BaseKafkaHelper` is the shared base** for the three connected helpers (everything but the schema registry). It tracks per-broker connection state (`host:port` keys), so one idle disconnect never flips `isHealthy()` to `false` - only when every broker is gone. `isReady()`, `getHealthStatus()`, and `getConnectedBrokerCount()` read the same state, and `close({ isForce })` gives every connected helper the same two-phase graceful-then-force shutdown.
- **Health status follows broker events automatically.** `client:broker:connect` marks a broker connected; `client:broker:disconnect` and `client:broker:failed` remove it and only flip the status to `'disconnected'` once every broker is gone; `close()` clears everything. You never set `healthStatus` yourself.
- **`KafkaSchemaRegistryHelper` extends `BaseHelper` directly.** It opens no broker connection, so it has no health tracking - it's a configuration wrapper you hand to a producer or consumer via `registry`.
- **Everything lives at the `/kafka` sub-path, never the root barrel.** `@platformatic/kafka` is an optional peer dependency (`^2.1.0` - `bun add @platformatic/kafka`); keeping it off the root barrel lets apps that never touch Kafka tree-shake it away entirely.
- **Generics default to `string`.** All four classes accept `<KeyType, ValueType, HeaderKeyType, HeaderValueType>` generics. Without serializers/deserializers, messages travel as raw `Buffer`.
- **`newInstance()` is the documented entry point.** Every class also exposes a public constructor, but `newInstance()` is what every example on these pages uses, and it carries the same generic inference: `KafkaProducerHelper.newInstance<string, MyEvent>({ ... })`.
- **Compiling to a single binary needs one extra step.** `bun build --compile` crashes at startup with `ENOENT: native.wasm` unless the build registers `platformaticWasmPlugin()` - see [Compiling to a Single Binary](./compile-binary).

**Exported constants** (`@venizia/ignis-helpers/kafka`):

| Constant | Exports | Purpose |
|---|---|---|
| `KafkaDefaults` | Timeouts, retry counts, buffer sizes | Every default value the helpers fall back to |
| `KafkaAcks` | `NONE` (`0`) / `LEADER` (`1`) / `ALL` (`-1`) | Producer acknowledgment levels |
| `KafkaGroupProtocol` | `CLASSIC` / `CONSUMER` | Consumer group protocol version |
| `KafkaHealthStatuses` | `CONNECTED` / `DISCONNECTED` / `UNKNOWN` | `getHealthStatus()` return values |
| `KafkaClientEvents` | Raw platformatic event names | Direct listening on `getProducer()` / `getConsumer()` / `getAdmin()` |

## Pages

Each class, and the one build-time gotcha, gets its own page:

| Page | Covers |
|---|---|
| [Producer](./producer) | `KafkaProducerHelper` - connection & SASL setup, serialization, compression, transactions, full `Producer` API |
| [Consumer](./consumer) | `KafkaConsumerHelper` - message callbacks, automatic reconnect, lag monitoring, full `Consumer` API |
| [Admin](./admin) | `KafkaAdminHelper` - topic, group, offset, ACL, and quota management |
| [Schema Registry](./schema-registry) | `KafkaSchemaRegistryHelper` for Avro/Protobuf/JSON Schema validated messages |
| [Compiling to a Single Binary](./compile-binary) | The `platformaticWasmPlugin()` fix for `bun build --compile` |
| [Examples & Troubleshooting](./examples) | End-to-end examples, IoC wiring, common errors |

Start with [Producer](./producer) or [Consumer](./consumer) if you're wiring up your first topic; start with [Compiling to a Single Binary](./compile-binary) if an existing app just started throwing `ENOENT: native.wasm` after a `bun build --compile`.

## See also

- [Queue Helpers](../queue/) - BullMQ, MQTT, and the in-memory queue: the other three queueing backends
- [Redis Helper](../redis/) - connection management used elsewhere in the helpers package
- [Kafka Helpers Enhancement](/changelogs/2026-03-12-kafka-helpers-enhancement) / [Kafka Helpers Refactor](/changelogs/2026-03-10-kafka-helpers-refactor) - changelog history for this module
- [@platformatic/kafka](https://github.com/platformatic/kafka) - the underlying Kafka client library
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/) - official Kafka docs
- [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) - the new consumer group protocol

**Files:**

- [`packages/helpers/src/modules/queue/kafka/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/base.ts) - `BaseKafkaHelper`, health tracking, broker events
- [`packages/helpers/src/modules/queue/kafka/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/index.ts) - the `/kafka` sub-path barrel
- [`packages/helpers/src/modules/queue/kafka/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/constants.ts) - `KafkaDefaults`, `KafkaAcks`, `KafkaGroupProtocol`, `KafkaHealthStatuses`, `KafkaClientEvents`
- [`packages/helpers/src/modules/queue/kafka/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/types.ts) - every `IKafka*` / `TKafka*` type
