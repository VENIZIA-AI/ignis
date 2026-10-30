---
title: Kafka Helpers Refactor & @platformatic/kafka v1.30.0
description: The Kafka producer, consumer and admin helpers are now thin wrappers around @platformatic/kafka v1.30.0, so existing Kafka code must be migrated.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-03-10

## Kafka Helpers Refactor

**In one line.** The Kafka helpers now hand you the underlying `@platformatic/kafka` client, with generic types, SASL and TLS support, and shared constants.

## What changed

- **Thin wrappers.** Get the client with `getProducer()`, `getConsumer()` or `getAdmin()` and call its API directly. The passthrough methods are gone.
- **Generic types.** All helpers accept `<KeyType, ValueType, HeaderKeyType, HeaderValueType>` for custom serialization.
- **SASL and TLS.** `IKafkaConnectionOptions` (renamed from `IKafkaBaseOpts`) extends the library's `ConnectionOptions`, so `sasl`, `tls`, `connectTimeout` and `requestTimeout` work.
- **Constants.** `KafkaDefaults`, `KafkaAcks` and `KafkaGroupProtocol`, imported from `@venizia/ignis-helpers/kafka`.
- **Upgrade.** `@platformatic/kafka` moves from v1.28.0 to v1.30.0.

## Who is affected

- **Anyone using `KafkaProducerHelper`, `KafkaConsumerHelper` or `KafkaAdminHelper`.** Follow the migration steps.

## Breaking changes

> [!WARNING]
> This is a complete API rewrite. All existing Kafka helper usage must be migrated.

**Before:**

```typescript
await producerHelper.send({ messages: [{ topic: 'orders', key: 'k1', value: 'v1' }] });
await producerHelper.sendBatch({ topicMessages: [...] });
await consumerHelper.eachMessage(['orders'], async (message) => { ... });
await consumerHelper.batchMessages(['orders'], async (batch) => { ... });
await adminHelper.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
await adminHelper.listTopics();
await adminHelper.describeGroups({ groups: ['my-group'] });

new KafkaProducerHelper({
  onConnected: () => console.log('connected'),
  onDisconnected: () => console.log('disconnected'),
  onError: ({ error }) => console.error(error),
});
```

**After:**

```typescript
const producer = producerHelper.getProducer();
await producer.send({ messages: [{ topic: 'orders', key: 'k1', value: 'v1' }] });

const consumer = consumerHelper.getConsumer();
const stream = await consumer.consume({ topics: ['orders'], mode: 'committed', fallbackMode: 'latest' });
for await (const message of stream) { ... }

const admin = adminHelper.getAdmin();
await admin.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
```

The `onConnected`, `onDisconnected` and `onError` options are removed. Use the `@platformatic/kafka` event emitters on the underlying client.

Removed exports: `KafkaConfigResourceTypes` (use `@platformatic/kafka`), and `IKafkaProduceMessage`, `IKafkaSendOptions`, `IKafkaConsumedMessage`, `IKafkaCommitOptions` (use `@platformatic/kafka` types). `IKafkaBaseOpts` is renamed to `IKafkaConnectionOptions`.

Helpers no longer default to `stringSerializers` / `stringDeserializers`; pass them explicitly.

## Migration

1. Upgrade the dependency: `bun add @platformatic/kafka@^1.30.0`.
2. Replace helper method calls with calls on the client from `getProducer()`, `getConsumer()` or `getAdmin()` (above).
3. Pass serializers and deserializers explicitly:

```typescript
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

KafkaProducerHelper.newInstance({ serializers: stringSerializers, ... });
KafkaConsumerHelper.newInstance({ deserializers: stringDeserializers, ... });
```

4. Replace `onConnected`, `onDisconnected` and `onError` with event listeners on the client.
5. Update type imports as listed above.

## Details

```typescript
import { KafkaDefaults, KafkaAcks, KafkaGroupProtocol } from '@venizia/ignis-helpers/kafka';

KafkaDefaults.RETRIES          // 3
KafkaDefaults.SESSION_TIMEOUT  // 30_000
KafkaAcks.ALL                  // -1
KafkaGroupProtocol.CLASSIC     // 'classic'

KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['broker:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'user', password: 'pass' },
  tls: true,
  connectTimeout: 30_000,
  requestTimeout: 30_000,
});

// Custom serialization types
KafkaProducerHelper.newInstance<Buffer, string, string, string>({ serializers: customSerializers, ... });
```
