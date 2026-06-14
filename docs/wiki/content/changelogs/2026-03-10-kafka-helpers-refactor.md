---
title: Kafka Helpers Refactor & @platformatic/kafka v1.30.0
description: Complete rewrite of Kafka helpers as thin wrappers, upgrade to @platformatic/kafka v1.30.0, generic type support, and constants extraction.
---

# Changelog - 2026-03-10

## Kafka Helpers Refactor

Complete rewrite of Kafka producer, consumer, and admin helpers from passthrough wrappers (~1,000+ lines) to thin wrappers (~280 lines total). Upgraded `@platformatic/kafka` from v1.28.0 to v1.30.0.

## Overview

- **Thin wrapper pattern**: Removed all passthrough methods. Users access `@platformatic/kafka` APIs directly via `getProducer()`, `getConsumer()`, `getAdmin()`
- **Generic types**: All helpers support custom serialization types via `<KeyType, ValueType, HeaderKeyType, HeaderValueType>`
- **Constants extraction**: New `constants.ts` with `KafkaDefaults`, `KafkaAcks`, `KafkaGroupProtocol`
- **Connection options**: `IKafkaConnectionOptions` extends `@platformatic/kafka`'s `ConnectionOptions` - full `sasl`, `tls`, `connectTimeout`, `requestTimeout` support
- **~75% code reduction**: Producer 234 -> 104 lines, Consumer 447 -> 114 lines, Admin 357 -> 68 lines

## Breaking Changes

> [!WARNING]
> This is a complete API rewrite. All existing Kafka helper usage must be migrated.

### 1. Removed passthrough methods on Producer

**Before:**
```typescript
const helper = KafkaProducerHelper.newInstance({ ... });
await helper.send({ messages: [{ topic: 'orders', key: 'k1', value: 'v1' }] });
await helper.sendBatch({ topicMessages: [...] });
```

**After:**
```typescript
const helper = KafkaProducerHelper.newInstance({ ... });
const producer = helper.getProducer();
await producer.send({ messages: [{ topic: 'orders', key: 'k1', value: 'v1' }] });
```

### 2. Removed passthrough methods on Consumer

**Before:**
```typescript
const helper = KafkaConsumerHelper.newInstance({ ... });
await helper.eachMessage(['orders'], async (message) => { ... });
await helper.batchMessages(['orders'], async (batch) => { ... });
```

**After:**
```typescript
const helper = KafkaConsumerHelper.newInstance({ ... });
const consumer = helper.getConsumer();
const stream = await consumer.consume({ topics: ['orders'], mode: 'committed', fallbackMode: 'latest' });
for await (const message of stream) { ... }
```

### 3. Removed passthrough methods on Admin

**Before:**
```typescript
const helper = KafkaAdminHelper.newInstance({ ... });
await helper.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
await helper.listTopics();
await helper.describeGroups({ groups: ['my-group'] });
```

**After:**
```typescript
const helper = KafkaAdminHelper.newInstance({ ... });
const admin = helper.getAdmin();
await admin.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
```

### 4. Removed callback options

**Before:**
```typescript
new KafkaProducerHelper({
  onConnected: () => console.log('connected'),
  onDisconnected: () => console.log('disconnected'),
  onError: ({ error }) => console.error(error),
});
```

**After:**
Use `@platformatic/kafka` event emitters directly on the underlying client.

### 5. Removed types and constants

The following exports were removed:
- `KafkaConfigResourceTypes` - use `@platformatic/kafka` directly
- `IKafkaProduceMessage`, `IKafkaSendOptions`, `IKafkaConsumedMessage`, `IKafkaCommitOptions` - use `@platformatic/kafka` types
- `IKafkaBaseOpts` - renamed to `IKafkaConnectionOptions`

### 6. No default serializers/deserializers

**Before:** Helpers defaulted to `stringSerializers`/`stringDeserializers`.

**After:** Pass serializers/deserializers explicitly via options.

```typescript
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

KafkaProducerHelper.newInstance({ serializers: stringSerializers, ... });
KafkaConsumerHelper.newInstance({ deserializers: stringDeserializers, ... });
```

## New Features

### Generic Type Parameters

All helpers now support custom serialization types:

```typescript
// Default: all string
const helper = KafkaProducerHelper.newInstance({ ... });

// Custom types
const helper = KafkaProducerHelper.newInstance<Buffer, string, string, string>({
  serializers: customSerializers,
  ...
});
```

### Constants File

New `constants.ts` with centralized defaults and enumerations:

```typescript
import { KafkaDefaults, KafkaAcks, KafkaGroupProtocol } from '@venizia/ignis-helpers/kafka';

KafkaDefaults.RETRIES          // 3
KafkaDefaults.SESSION_TIMEOUT  // 30_000
KafkaAcks.ALL                  // -1
KafkaAcks.isValid(-1)          // true
KafkaGroupProtocol.CLASSIC     // 'classic'
KafkaGroupProtocol.isValid('classic') // true
```

### SASL & TLS Support

`IKafkaConnectionOptions` now extends `ConnectionOptions`, enabling authentication and encryption:

```typescript
KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['broker:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'user', password: 'pass' },
  tls: true,
  connectTimeout: 30_000,
  requestTimeout: 30_000,
});
```

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/modules/queue/kafka/common/constants.ts` | New file: `KafkaGroupProtocol`, `KafkaAcks`, `KafkaDefaults` |
| `src/modules/queue/kafka/common/types.ts` | Rewritten: pure types/interfaces, generic support, extends `ConnectionOptions` |
| `src/modules/queue/kafka/common/index.ts` | Updated: exports both `constants` and `types` |
| `src/modules/queue/kafka/producer.helper.ts` | Rewritten: thin wrapper with generics (234 -> 104 lines) |
| `src/modules/queue/kafka/consumer.helper.ts` | Rewritten: thin wrapper with generics (447 -> 114 lines) |
| `src/modules/queue/kafka/admin.helper.ts` | Rewritten: thin wrapper (357 -> 68 lines) |
| `src/__tests__/kafka/kafka.test.ts` | Rewritten: 45 tests covering construction, factory, getters, close, constants |
| `package.json` | Upgraded `@platformatic/kafka` to `^1.30.0`, fixed sub-path export |

### Docs Package (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/extensions/helpers/kafka/index.md` | Rewritten to match new thin wrapper API |
| `wiki/changelogs/2026-03-10-kafka-helpers-refactor.md` | This changelog |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from the previous Kafka helpers.

### Step 1: Upgrade dependency

```bash
bun add @platformatic/kafka@^1.30.0
```

### Step 2: Replace passthrough method calls

Replace direct method calls on the helper with calls on the underlying client:

```typescript
// Producer
const producer = helper.getProducer();
await producer.send({ ... });

// Consumer
const consumer = helper.getConsumer();
const stream = await consumer.consume({ topics: [...], mode: 'committed', fallbackMode: 'latest' });

// Admin
const admin = helper.getAdmin();
await admin.createTopics({ ... });
```

### Step 3: Pass serializers/deserializers explicitly

```typescript
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

KafkaProducerHelper.newInstance({ serializers: stringSerializers, ... });
KafkaConsumerHelper.newInstance({ deserializers: stringDeserializers, ... });
```

### Step 4: Remove callback options

Replace `onConnected`, `onDisconnected`, `onError` with event listeners on the underlying client.

### Step 5: Update type imports

- `IKafkaBaseOpts` -> `IKafkaConnectionOptions`
- Remove: `IKafkaProduceMessage`, `IKafkaSendOptions`, `IKafkaConsumedMessage`, `KafkaConfigResourceTypes`
- Use `@platformatic/kafka` types directly for message and send option types
