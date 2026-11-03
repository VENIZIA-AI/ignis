---
title: Kafka Helpers Enhancement - Health, Callbacks, Transactions, Schema Registry
description: The Kafka helpers gain health tracking, graceful shutdown, message and consumer group callbacks, lag monitoring, transactions and a schema registry helper.
packages: ['@venizia/ignis-docs', '@venizia/ignis-helpers']
---

# Changelog - 2026-03-12

## Kafka Helpers Enhancement

**In one line.** The Kafka producer, consumer and admin helpers now report their health, shut down gracefully, and offer callbacks, lag monitoring, transactions and a schema registry.

## What changed

- **Health and shutdown.** All three helpers share `BaseKafkaHelper`: `isHealthy()`, `isReady()`, `getHealthStatus()` (`'connected'` | `'disconnected'` | `'unknown'`), broker callbacks `onBrokerConnect` / `onBrokerDisconnect`, and a graceful `close()` with a `shutdownTimeout` that falls back to a forced close.
- **Message callbacks.** The consumer takes `onMessage`, `onMessageDone` and `onMessageError` in its options, and `consumer.start({ topics })` begins consuming.
- **Consumer group events.** `onGroupJoin`, `onGroupLeave`, `onGroupRebalance` and `onHeartbeatError`.
- **Lag monitoring.** `onLag` and `onLagError` options, with `startLagMonitoring({ topics, interval })` and `stopLagMonitoring()`.
- **Transactions.** `producer.runInTransaction(async ({ send, addConsumer, addOffset }) => ...)`.
- **Schema registry.** New `KafkaSchemaRegistryHelper`; pass `registry.getRegistry()` as the `registry` option of the producer.
- **New constants.** `KafkaHealthStatuses`, `KafkaClientEvents`, and defaults `KafkaDefaults.SHUTDOWN_TIMEOUT` (30000), `LAG_MONITOR_INTERVAL` (30000), `CONSUME_MODE` (`'committed'`), `CONSUME_FALLBACK_MODE` (`'latest'`).
- **Renamed option types.** `IKafkaProducerOpts`, `IKafkaConsumerOpts`, `IKafkaAdminOpts` and `IKafkaSchemaRegistryOpts` are now `IKafkaProducerOptions`, `IKafkaConsumerOptions`, `IKafkaAdminOptions` and `IKafkaSchemaRegistryOptions`.

## Who is affected

- **Existing Kafka code.** All new options are optional, `getProducer()`, `getConsumer()` and `getAdmin()` still return the raw `@platformatic/kafka` objects, and `newInstance()` accepts existing options. Only code importing the old `...Opts` type names must rename them.

## Details

```typescript
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  shutdownTimeout: 30_000,
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
  onMessage: async ({ message }) => {
    await processMessage(message);
    await message.commit();
  },
  onMessageError: ({ error, message }) => console.error('Error:', error),
  onLag: ({ lag }) => { ... },
});

await consumer.start({ topics: ['orders'] });
consumer.startLagMonitoring({ topics: ['orders'], interval: 10_000 });

const result = await producer.runInTransaction(async ({ send, addConsumer, addOffset }) => {
  await addConsumer(consumer.getConsumer());
  await addOffset(incomingMessage);
  return send({ messages: [{ topic: 'output', key: 'k1', value: 'v1' }] });
});
```

`close()` now also accepts an optional `{ isForce? }`.
