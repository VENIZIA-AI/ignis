---
title: Kafka
description: Apache Kafka producer, consumer, admin, and schema registry helpers built on a pure TypeScript client
difficulty: intermediate
---

# Kafka

IGNIS wraps `@platformatic/kafka` in four scoped helpers: producer, consumer, admin, and schema registry. Each adds health tracking, graceful shutdown, and IGNIS-style scoped logging over the raw client.

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

`getProducer()` returns the full `@platformatic/kafka` `Producer`. Every helper follows the same three-step pattern:

| Step | Call |
|---|---|
| Construct | `newInstance()` |
| Reach the native client | `getProducer()` / `getConsumer()` / `getAdmin()` |
| Close | through the helper, not the native client |

## Which helper do I need

| Class | Wraps | Use it to |
|---|---|---|
| `KafkaProducerHelper` | `Producer` | Publish messages, run transactions |
| `KafkaConsumerHelper` | `Consumer` | Consume via consumer groups, monitor lag |
| `KafkaAdminHelper` | `Admin` | Manage topics, partitions, groups, ACLs, configs |
| `KafkaSchemaRegistryHelper` | `ConfluentSchemaRegistry` | Schema-validated serialization (Avro/Protobuf/JSON Schema) |

A few facts hold across all four:

- **Producer, consumer, and admin share one health and close API.** `isHealthy()`, `isReady()`, `getHealthStatus()`, and `close({ isForce })` mean the same thing on every class. Each page documents the exact return values.
- **Schema registry opens no broker connection.** It extends `BaseHelper` directly, not the shared connected-helper base. It has no health tracking - it's a configuration wrapper you hand to a producer or consumer via `registry`.
- **Everything lives under `/kafka`, never the root barrel.** Install the optional peer yourself: `bun add @platformatic/kafka` (`^2.6.1`). An app that never touches Kafka tree-shakes it away entirely.
- **Compiling to a single binary needs one extra build step.** Skip it, and the compiled app crashes at startup with `ENOENT: native.wasm` or `Cannot find package 'ajv-draft-04'` - see [Compiling to a Single Binary](./compile-binary).
- **Defaults and enum-like values ship as exported constants**, not magic numbers - `KafkaDefaults`, `KafkaAcks`, `KafkaGroupProtocol`, `KafkaHealthStatuses`. Each page's options table names the constant it uses.

## Find what you need

| You want to | Go to |
|---|---|
| Publish messages, set up SASL/TLS, run transactions | [Producer](./producer) |
| Consume messages, monitor lag, handle reconnects | [Consumer](./consumer) |
| Create or delete topics, inspect consumer groups, manage ACLs | [Admin](./admin) |
| Validate message shape with Avro, Protobuf, or JSON Schema | [Schema Registry](./schema-registry) |
| See end-to-end examples or fix a connection error | [Examples & Troubleshooting](./examples) |
| Ship an app that imports a Kafka helper as a single binary | [Compiling to a Single Binary](./compile-binary) |

Start with [Producer](./producer) or [Consumer](./consumer) if you're wiring up your first topic. Start with [Compiling to a Single Binary](./compile-binary) if an existing app started crashing at startup after a `bun build --compile`.

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
- [`packages/helpers/src/modules/queue/kafka/common/types/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/types) - every `IKafka*` / `TKafka*` type, split by topic (connection, callbacks, producer, consumer, admin)
