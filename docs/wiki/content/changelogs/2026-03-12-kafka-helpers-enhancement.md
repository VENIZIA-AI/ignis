---
title: Kafka Helpers Enhancement - Health, Callbacks, Transactions, Schema Registry
description: Major enhancement adding BaseKafkaHelper base class, health tracking, graceful shutdown, message callbacks, consumer group events, lag monitoring, transaction helper, and schema registry support.
---

# Changelog - 2026-03-12

## Kafka Helpers Enhancement

Major enhancement to the Kafka helpers adding enterprise-grade capabilities while maintaining backward compatibility. All three helpers now share a common `BaseKafkaHelper` base class with health tracking, broker event callbacks, and graceful shutdown.

## New Features

### BaseKafkaHelper - Shared Base Class

All Kafka helpers (producer, consumer, admin) now extend `BaseKafkaHelper<TClient>` which provides:

- **Health tracking**: `isHealthy()`, `isReady()`, `getHealthStatus()` - automatically updated via broker events
- **Broker event callbacks**: `onBrokerConnect`, `onBrokerDisconnect` via options
- **Graceful shutdown**: Timeout-based with automatic force fallback
- **Health statuses**: `'connected'` | `'disconnected'` | `'unknown'`

```typescript
const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  shutdownTimeout: 30_000,
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),
});

helper.isHealthy();      // true when broker connected
helper.getHealthStatus(); // 'connected' | 'disconnected' | 'unknown'
await helper.close();     // graceful shutdown with timeout fallback
```

### Consumer Message Callbacks

Callbacks-in-options pattern (matching BullMQ/MQTT helpers):

```typescript
const consumer = KafkaConsumerHelper.newInstance({
  ...,
  onMessage: async ({ message }) => {
    await processMessage(message);
    await message.commit();
  },
  onMessageDone: ({ message }) => console.log('Done:', message.key),
  onMessageError: ({ error, message }) => console.error('Error:', error),
});

await consumer.start({ topics: ['orders'] });
```

### Consumer Group Event Callbacks

```typescript
const consumer = KafkaConsumerHelper.newInstance({
  ...,
  onGroupJoin: ({ groupId, memberId, generationId }) => { ... },
  onGroupLeave: ({ groupId, memberId }) => { ... },
  onGroupRebalance: ({ groupId }) => { ... },
  onHeartbeatError: ({ error, groupId, memberId }) => { ... },
});
```

### Consumer Lag Monitoring

```typescript
const consumer = KafkaConsumerHelper.newInstance({
  ...,
  onLag: ({ lag }) => { ... },
  onLagError: ({ error }) => { ... },
});

consumer.startLagMonitoring({ topics: ['orders'], interval: 10_000 });
consumer.stopLagMonitoring();
```

### Producer Transaction Helper

```typescript
const result = await producer.runInTransaction(async ({ send, addConsumer, addOffset }) => {
  await addConsumer(consumer.getConsumer());
  await addOffset(incomingMessage);
  return send({ messages: [{ topic: 'output', key: 'k1', value: 'v1' }] });
});
```

### Schema Registry Helper (New)

```typescript
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
});

const producer = KafkaProducerHelper.newInstance({
  ...,
  registry: registry.getRegistry(),
});
```

## Constants & Types

### New Constants

| Constant | Description |
|----------|-------------|
| `KafkaHealthStatuses` | `CONNECTED`, `DISCONNECTED`, `UNKNOWN` |
| `KafkaClientEvents` | All broker + consumer event name constants |
| `KafkaDefaults.SHUTDOWN_TIMEOUT` | `30000` |
| `KafkaDefaults.LAG_MONITOR_INTERVAL` | `30000` |
| `KafkaDefaults.CONSUME_MODE` | `'committed'` |
| `KafkaDefaults.CONSUME_FALLBACK_MODE` | `'latest'` |

### New Callback Types

All callbacks follow the IGNIS `opts: { ... }` pattern with `ValueOrPromise<void>` return type:

- `TKafkaBrokerEventCallback`
- `TKafkaMessageCallback`, `TKafkaMessageDoneCallback`, `TKafkaMessageErrorCallback`
- `TKafkaGroupJoinCallback`, `TKafkaGroupLeaveCallback`, `TKafkaGroupRebalanceCallback`
- `TKafkaHeartbeatErrorCallback`
- `TKafkaLagCallback`, `TKafkaLagErrorCallback`
- `TKafkaTransactionCallback`

### Renamed Types

| Before | After |
|--------|-------|
| `IKafkaProducerOpts` | `IKafkaProducerOptions` |
| `IKafkaConsumerOpts` | `IKafkaConsumerOptions` |
| `IKafkaAdminOpts` | `IKafkaAdminOptions` |
| `IKafkaSchemaRegistryOpts` | `IKafkaSchemaRegistryOptions` |

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `kafka/common/constants.ts` | Added `KafkaHealthStatuses`, `KafkaClientEvents`, new defaults |
| `kafka/common/types.ts` | Added callback types, enhanced options, transaction context, schema registry options |
| `kafka/base.ts` | **New**: `BaseKafkaHelper<TClient>` - shared health tracking, broker events, graceful shutdown |
| `kafka/producer.ts` | Extended `BaseKafkaHelper`, added `runInTransaction()`, graceful shutdown |
| `kafka/consumer.ts` | Extended `BaseKafkaHelper`, added `start()`, message callbacks, lag monitoring, graceful shutdown |
| `kafka/admin.ts` | Extended `BaseKafkaHelper`, added graceful shutdown |
| `kafka/schema/registry.ts` | **New**: `KafkaSchemaRegistryHelper` |
| `kafka/index.ts` | Added base and schema exports |

### Docs Package (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/extensions/helpers/kafka/index.md` | Rewritten - architecture, BaseKafkaHelper, all constants |
| `wiki/extensions/helpers/kafka/producer.md` | Rewritten - health, transactions, graceful shutdown |
| `wiki/extensions/helpers/kafka/consumer.md` | Rewritten - callbacks, start(), lag monitoring, graceful shutdown |
| `wiki/extensions/helpers/kafka/admin.md` | Updated - health tracking, graceful shutdown |
| `wiki/extensions/helpers/kafka/schema-registry.md` | **New** |
| `wiki/extensions/helpers/kafka/examples.md` | Rewritten - all examples use new callback/health API |
| `wiki/changelogs/2026-03-12-kafka-helpers-enhancement.md` | This changelog |

## Backward Compatibility

- All new options are **optional** - existing code works unchanged
- `getProducer()`, `getConsumer()`, `getAdmin()` still return raw platformatic objects
- `close()` signature adds optional `{ isForce? }` to the existing call
- Generic type defaults remain `string` for all positions
- `static newInstance()` accepts existing options without changes
