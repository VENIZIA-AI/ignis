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

The `KafkaConsumerHelper` provides stream-based consumption with support for both `eachMessage` and `batchMessages` processing modes.

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';

const consumer = KafkaConsumerHelper.newInstance({
  identifier: 'order-consumer',
  bootstrapBrokers: ['localhost:9092'],
  groupId: 'order-processing-group',
  autocommit: false, // Recommended for manual control
});

// Consume messages one-by-one
const abortCtrl = new AbortController();
await consumer.eachMessage(
  ['orders'],
  async (message) => {
    console.log(`Topic: ${message.topic}, Partition: ${message.partition}`);
    console.log(`Key: ${message.key}, Value: ${message.value}`);
    
    // Commit after successful processing
    await message.commit();
  },
  { abortSignal: abortCtrl.signal, fromBeginning: false }
);

// OR: Consume messages in batches
await consumer.batchMessages(
  ['orders'],
  async (batch) => {
    console.log(`Processing batch of ${batch.length} messages`);
    for (const msg of batch) {
      await msg.commit();
    }
  },
  { batchSize: 20, batchTimeMs: 5000 }
);

// Stop consuming
abortCtrl.abort();

// Graceful shutdown
await consumer.close();
```

### IKafkaConsumerOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bootstrapBrokers` | `string[]` | -- | Kafka broker addresses (required) |
| `groupId` | `string` | -- | Consumer group ID (required) |
| `identifier` | `string` | -- | Scoped logging identifier |
| `clientId` | `string` | `'consumer'` | Kafka client ID |
| `autocommit` | `boolean \| number` | `false` | Auto-commit offsets (or interval in ms) |
| `sessionTimeout` | `number` | `30000` | Session timeout in ms |
| `heartbeatInterval` | `number` | `3000` | Heartbeat interval in ms |
| `rebalanceTimeout` | `number` | `30000` | Rebalance timeout in ms |
| `groupProtocol` | `'classic' \| 'consumer'` | `'classic'` | Consumer group protocol |
| `groupInstanceId` | `string` | -- | Static membership instance ID |
| `highWaterMark` | `number` | `1024` | Stream high water mark |
| `minBytes` | `number` | `1` | Min bytes to fetch |
| `maxBytes` | `number` | -- | Max bytes to fetch per partition |
| `maxWaitTime` | `number` | -- | Max wait time for fetch in ms |
| `metadataMaxAge` | `number` | `300000` | Metadata max age in ms |
| `retries` | `number` | `3` | Connection retries |
| `retryDelay` | `number` | `1000` | Delay between retries in ms |

### Consumer API

| Method | Returns | Description |
|--------|---------|-------------|
| `eachMessage(topics, handler, opts)` | `Promise<void>` | Consume messages one-by-one. `opts: IEachMessageOpts` |
| `batchMessages(topics, handler, opts)` | `Promise<void>` | Consume messages in batches. `opts: IBatchMessagesOpts` |
| `consume(topics, opts)` | `Promise<AsyncGenerator>` | Access raw async generator of messages |
| `commit(offsets)` | `Promise<void>` | Manually commit specific offsets |
| `close(isForce)` | `Promise<void>` | Close consumer connection |
| `static newInstance(opts)` | `KafkaConsumerHelper` | Factory method |

### Manual Commit

When `autocommit` is `false`, each message must be explicitly committed:

```typescript
const abortCtrl = new AbortController();

await consumer.eachMessage(
  ['orders'],
  async (message) => {
    // Process your message
    await processMessage(message);
    
    // Simple commit using the message object (replaces cumbersome offset definitions)
    await message.commit();
  },
  { abortSignal: abortCtrl.signal }
);
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
