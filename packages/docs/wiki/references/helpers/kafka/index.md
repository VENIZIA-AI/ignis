# Kafka <Badge type="warning" text="Experimental" />

Apache Kafka event streaming with producer, consumer, and admin helpers. Built on [`@platformatic/kafka`](https://github.com/platformatic/kafka).

> [!WARNING]
> This helper is **experimental**. The API may change in future releases.

## Quick Reference

| Class | Extends | Peer Dependency | Use Case |
|-------|---------|-----------------|----------|
| **KafkaProducerHelper** | `BaseHelper` | `@platformatic/kafka` | Publish messages to Kafka topics |
| **KafkaConsumerHelper** | `BaseHelper` | `@platformatic/kafka` | Consume messages from Kafka topics with consumer groups |
| **KafkaAdminHelper** | `BaseHelper` | `@platformatic/kafka` | Manage topics, partitions, consumer groups, and configs |

### Import Path

```typescript
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
  KafkaAdminHelper,
  KafkaDefaults,
  KafkaAcks,
  KafkaConfigResourceTypes,
} from '@venizia/ignis-helpers/kafka';

import type {
  IKafkaConnectionOptions,
  IKafkaProducerOptions,
  IKafkaConsumerOptions,
  IKafkaAdminOptions,
  IKafkaProduceMessage,
  IKafkaSendOptions,
  IKafkaConsumedMessage,
  IKafkaCommitOptions,
} from '@venizia/ignis-helpers/kafka';
```

## Installation

```bash
bun add @platformatic/kafka
```

## Producer

The `KafkaProducerHelper` wraps `@platformatic/kafka`'s `Producer` for publishing messages to Kafka topics.

```typescript
import { KafkaProducerHelper, KafkaAcks } from '@venizia/ignis-helpers/kafka';

const producer = new KafkaProducerHelper({
  identifier: 'order-producer',
  bootstrapBrokers: ['localhost:9092'],
  acks: KafkaAcks.ALL,
  autocreateTopics: true,
  onConnected: () => console.log('Producer connected'),
  onError: ({ error }) => console.error('Producer error:', error),
});

// Send messages
await producer.send({
  messages: [
    { topic: 'orders', key: 'order-123', value: JSON.stringify({ status: 'created' }) },
  ],
});

// Send batch across multiple topics
await producer.sendBatch({
  topicMessages: [
    { topic: 'orders', messages: [{ key: 'o1', value: '...' }] },
    { topic: 'notifications', messages: [{ key: 'n1', value: '...' }] },
  ],
});

// Graceful shutdown
await producer.close();
```

### IKafkaProducerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses (required) |
| `identifier` | `string` | -- | Scoped logging identifier |
| `clientId` | `string` | `'ignis-kafka'` | Kafka client ID |
| `acks` | `number` | -- | Acknowledgment level (`KafkaAcks.NONE`, `LEADER`, `ALL`) |
| `autocreateTopics` | `boolean` | -- | Auto-create topics on first produce |
| `timeout` | `number` | -- | Connection timeout in ms |
| `retries` | `number \| boolean` | -- | Retry configuration |
| `retryDelay` | `number` | -- | Delay between retries in ms |
| `serializers` | `Partial<Serializers>` | -- | Custom key/value/header serializers |
| `onConnected` | `() => void` | -- | Broker connect callback |
| `onDisconnected` | `() => void` | -- | Broker disconnect callback |
| `onError` | `(opts: { error: Error }) => void` | -- | Error callback |

### Producer API

| Method | Returns | Description |
|--------|---------|-------------|
| `send(opts)` | `Promise<void>` | Send messages. `opts: { messages: IKafkaProduceMessage[]; acks? }` |
| `sendBatch(opts)` | `Promise<void>` | Send to multiple topics. `opts: { topicMessages: Array<{ topic; messages }> }` |
| `getProducer()` | `Producer` | Access the underlying `@platformatic/kafka` Producer |
| `close()` | `Promise<void>` | Gracefully close the producer connection |
| `static newInstance(opts)` | `KafkaProducerHelper` | Factory method |

## Consumer

The `KafkaConsumerHelper` provides a stream-based consumer with consumer group support, pause/resume, manual commit, and lag monitoring.

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';

const consumer = new KafkaConsumerHelper({
  identifier: 'order-consumer',
  bootstrapBrokers: ['localhost:9092'],
  groupId: 'order-processing-group',
  topics: ['orders'],
  mode: 'latest',
  autocommit: true,
  onMessage: async ({ message }) => {
    console.log(`Topic: ${message.topic}, Partition: ${message.partition}`);
    console.log(`Key: ${message.key}, Value: ${message.value}`);
  },
  onConnected: () => console.log('Consumer connected'),
  onGroupJoin: ({ groupId, memberId }) => {
    console.log(`Joined group ${groupId} as ${memberId}`);
  },
  onError: ({ error }) => console.error('Consumer error:', error),
});

// Start consuming
await consumer.start();

// Pause/resume
consumer.pause();
consumer.resume();

// Graceful shutdown
await consumer.close();
```

### IKafkaConsumerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses (required) |
| `groupId` | `string` | -- | Consumer group ID (required) |
| `topics` | `string[]` | -- | Topics to consume (required) |
| `identifier` | `string` | -- | Scoped logging identifier |
| `clientId` | `string` | `'ignis-kafka'` | Kafka client ID |
| `mode` | `'latest' \| 'earliest' \| 'committed'` | `'latest'` | Offset reset strategy |
| `autocommit` | `boolean \| number` | `true` | Auto-commit offsets (or interval in ms) |
| `sessionTimeout` | `number` | `30000` | Session timeout in ms |
| `heartbeatInterval` | `number` | `3000` | Heartbeat interval in ms |
| `highWaterMark` | `number` | `1024` | Stream high water mark |
| `maxWaitTime` | `number` | `5000` | Max wait time for fetch in ms |
| `deserializers` | `Partial<Deserializers>` | -- | Custom key/value/header deserializers |
| `onMessage` | `(opts: { message }) => ValueOrPromise<void>` | -- | Message handler |
| `onConnected` | `() => void` | -- | Broker connect callback |
| `onDisconnected` | `() => void` | -- | Broker disconnect callback |
| `onGroupJoin` | `(opts: { groupId; memberId }) => void` | -- | Consumer group join callback |
| `onGroupLeave` | `() => void` | -- | Consumer group leave callback |
| `onRebalance` | `() => void` | -- | Group rebalance callback |
| `onLag` | `(opts: { offsets }) => void` | -- | Consumer lag callback |
| `onError` | `(opts: { error: Error }) => void` | -- | Error callback |

### Consumer API

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Start consuming messages (fires async consume loop) |
| `pause()` | `void` | Pause the message stream |
| `resume()` | `void` | Resume the message stream |
| `isPaused()` | `boolean` | Check if the stream is paused |
| `isConsuming()` | `boolean` | Check if the consumer is running |
| `commit(opts)` | `Promise<void>` | Manually commit offsets |
| `startLagMonitoring(opts)` | `void` | Start lag monitoring. `opts: { interval: number }` |
| `stopLagMonitoring()` | `void` | Stop lag monitoring |
| `getConsumer()` | `Consumer` | Access the underlying `@platformatic/kafka` Consumer |
| `close()` | `Promise<void>` | Abort consume loop, close stream and consumer |
| `static newInstance(opts)` | `KafkaConsumerHelper` | Factory method |

### Manual Commit

When `autocommit` is `false`, commit offsets explicitly:

```typescript
const consumer = new KafkaConsumerHelper({
  // ...
  autocommit: false,
  onMessage: async ({ message }) => {
    await processMessage(message);
    // Commit after successful processing
    await consumer.commit({
      offsets: [{
        topic: message.topic,
        partition: message.partition,
        offset: message.offset,
        leaderEpoch: 0,
      }],
    });
  },
});
```

## Admin

The `KafkaAdminHelper` provides topic, partition, consumer group, and config management.

```typescript
import { KafkaAdminHelper, KafkaConfigResourceTypes } from '@venizia/ignis-helpers/kafka';

const admin = new KafkaAdminHelper({
  identifier: 'kafka-admin',
  bootstrapBrokers: ['localhost:9092'],
});

// Topic management
await admin.createTopics({ topics: ['orders', 'notifications'], partitions: 3, replicas: 1 });
const topics = await admin.listTopics();
await admin.deleteTopics({ topics: ['old-topic'] });

// Partition management
await admin.createPartitions({ topics: [{ name: 'orders', count: 6 }] });

// Consumer group management
const groups = await admin.listGroups();
const groupDetails = await admin.describeGroups({ groups: ['order-processing-group'] });
await admin.deleteGroups({ groups: ['stale-group'] });

// Config management
const configs = await admin.describeConfigs({
  resources: [{
    resourceType: KafkaConfigResourceTypes.TOPIC,
    resourceName: 'orders',
  }],
});

// Metadata
const meta = await admin.metadata({ topics: ['orders'] });

// Cleanup
await admin.close();
```

### Admin API

| Method | Returns | Description |
|--------|---------|-------------|
| `createTopics(opts)` | `Promise<any>` | Create topics with partitions and replicas |
| `deleteTopics(opts)` | `Promise<void>` | Delete topics |
| `listTopics(opts?)` | `Promise<string[]>` | List topics (optionally include internals) |
| `metadata(opts?)` | `Promise<any>` | Fetch cluster/topic metadata |
| `listGroups(opts?)` | `Promise<any>` | List consumer groups (filter by state) |
| `describeGroups(opts)` | `Promise<any>` | Describe consumer groups |
| `deleteGroups(opts)` | `Promise<void>` | Delete consumer groups |
| `listConsumerGroupOffsets(opts)` | `Promise<any>` | List offsets for consumer groups |
| `alterConsumerGroupOffsets(opts)` | `Promise<void>` | Alter consumer group offsets |
| `createPartitions(opts)` | `Promise<void>` | Create partitions for topics |
| `describeConfigs(opts)` | `Promise<any>` | Describe resource configs |
| `alterConfigs(opts)` | `Promise<void>` | Alter resource configs |
| `getAdmin()` | `Admin` | Access the underlying `@platformatic/kafka` Admin |
| `close()` | `Promise<void>` | Close the admin connection |
| `static newInstance(opts)` | `KafkaAdminHelper` | Factory method |

## Constants

### KafkaDefaults

| Constant | Value | Description |
|----------|-------|-------------|
| `CLIENT_ID` | `'ignis-kafka'` | Default Kafka client ID |
| `SESSION_TIMEOUT` | `30000` | Session timeout (ms) |
| `HEARTBEAT_INTERVAL` | `3000` | Heartbeat interval (ms) |
| `MAX_WAIT_TIME` | `5000` | Max fetch wait time (ms) |
| `HIGH_WATER_MARK` | `1024` | Stream high water mark |
| `AUTOCOMMIT_INTERVAL` | `100` | Auto-commit interval (ms) |

### KafkaAcks

| Constant | Value | Description |
|----------|-------|-------------|
| `NONE` | `0` | No acknowledgment |
| `LEADER` | `1` | Leader acknowledgment only |
| `ALL` | `-1` | All replicas must acknowledge |

### KafkaConfigResourceTypes

| Constant | Value | Description |
|----------|-------|-------------|
| `UNKNOWN` | `0` | Unknown resource type |
| `TOPIC` | `2` | Topic resource |
| `BROKER` | `4` | Broker resource |
| `BROKER_LOGGER` | `8` | Broker logger resource |

## See Also

- **Other Helpers:**
  - [Queue Helper](../queue/) -- BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) -- Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) -- Underlying Kafka client library
