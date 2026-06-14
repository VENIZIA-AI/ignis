# Examples & Troubleshooting

Complete examples and common issue resolution for the Kafka helpers.

## Producer: Send Messages with Health Monitoring

```typescript
import { KafkaProducerHelper, KafkaAcks } from '@venizia/ignis-helpers/kafka';
import { stringSerializers } from '@platformatic/kafka';

const helper = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['broker1:9092', 'broker2:9092'],
  clientId: 'interval-producer',
  serializers: stringSerializers,
  acks: KafkaAcks.ALL,
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
  onBrokerDisconnect: ({ broker }) => console.warn(`Disconnected from ${broker.host}`),
});

const producer = helper.getProducer();
let count = 0;

const interval = setInterval(async () => {
  if (!helper.isHealthy()) {
    console.warn('Producer not healthy, skipping...');
    return;
  }

  await producer.send({
    messages: [{
      topic: 'events',
      key: `key-${count % 3}`,
      value: JSON.stringify({ index: count, timestamp: new Date().toISOString() }),
    }],
  });
  count++;
}, 100);

process.on('SIGINT', async () => {
  clearInterval(interval);
  console.log(`Shutting down... (sent ${count} messages)`);
  await helper.close();
  process.exit(0);
});
```

## Consumer: Callback-Based with Lag Monitoring

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringDeserializers } from '@platformatic/kafka';

const helper = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['broker1:9092', 'broker2:9092'],
  clientId: 'event-consumer',
  groupId: 'processing-group',
  deserializers: stringDeserializers,

  onMessage: async ({ message }) => {
    const data = JSON.parse(message.value!);
    console.log(`Processing: ${message.key} -> ${JSON.stringify(data)}`);
    await message.commit();
  },
  onMessageDone: ({ message }) => {
    console.log(`Done: ${message.key}`);
  },
  onMessageError: ({ error, message }) => {
    console.error(`Error processing ${message?.key}:`, error.message);
  },

  onGroupJoin: ({ groupId, memberId }) => {
    console.log(`Joined group ${groupId} as ${memberId}`);
  },
  onGroupRebalance: ({ groupId }) => {
    console.log(`Rebalance in ${groupId}`);
  },

  onLag: ({ lag }) => {
    for (const [topic, partitionLags] of lag) {
      partitionLags.forEach((lagValue, partition) => {
        if (lagValue > 1000n) {
          console.warn(`High lag on ${topic}[${partition}]: ${lagValue}`);
        }
      });
    }
  },
  onLagError: ({ error }) => console.error('Lag error:', error),
});

await helper.start({ topics: ['events'] });
helper.startLagMonitoring({ topics: ['events'], interval: 10_000 });

process.on('SIGINT', async () => {
  await helper.close();
  process.exit(0);
});
```

## Consumer: Direct Stream Access (for-await)

```typescript
import { KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringDeserializers } from '@platformatic/kafka';

const helper = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'stream-consumer',
  groupId: 'stream-group',
  deserializers: stringDeserializers,
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}`),
});

// Use the consumer directly for async iterator pattern
const consumer = helper.getConsumer();
const stream = await consumer.consume({
  topics: ['orders'],
  mode: 'committed',
  fallbackMode: 'latest',
});

for await (const message of stream) {
  console.log(`${message.topic}[${message.partition}] @${message.offset}: ${message.key} -> ${message.value}`);
  await message.commit();
}

await stream.close();
await helper.close();
```

## Admin: Topic Setup Script

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

async function setupTopics() {
  const helper = KafkaAdminHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'topic-setup',
    onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}`),
  });

  const admin = helper.getAdmin();

  // Create topics
  await admin.createTopics({
    topics: ['orders', 'inventory', 'notifications'],
    partitions: 6,
    replicas: 3,
    configs: [
      { name: 'retention.ms', value: '604800000' },
      { name: 'compression.type', value: 'zstd' },
    ],
  });

  // Verify
  const topics = await admin.listTopics({ includeInternals: false });
  console.log('Topics:', topics);

  // Health check
  console.log('Healthy:', helper.isHealthy());

  await helper.close();
}

setupTopics();
```

## Exactly-Once: Consume-Transform-Produce

```typescript
import { KafkaProducerHelper, KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'eos-producer',
  serializers: stringSerializers,
  transactionalId: 'eos-tx',
  idempotent: true,
});

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'eos-consumer',
  groupId: 'eos-group',
  deserializers: stringDeserializers,
  autocommit: false,

  onMessage: async ({ message }) => {
    // Consume-transform-produce within a single transaction
    const transformed = JSON.stringify({
      ...JSON.parse(message.value!),
      processedAt: new Date().toISOString(),
    });

    await producer.runInTransaction(async ({ send, addConsumer, addOffset }) => {
      await addConsumer(consumer.getConsumer());
      await addOffset(message);
      await send({
        messages: [{ topic: 'processed-events', key: message.key, value: transformed }],
      });
    });
  },
  onMessageError: ({ error }) => console.error('Processing error:', error),
});

await consumer.start({ topics: ['raw-events'] });
```

## Schema Registry: Validated Messages

```typescript
import {
  KafkaSchemaRegistryHelper,
  KafkaProducerHelper,
  KafkaConsumerHelper,
} from '@venizia/ignis-helpers/kafka';

const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
});

const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'schema-producer',
  registry: registry.getRegistry(),
  onBrokerConnect: ({ broker }) => console.log(`Producer connected to ${broker.host}`),
});

// Sends schema-validated objects
await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-1',
    value: { id: 1, status: 'created', total: 99.99 },
  }],
});

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'schema-consumer',
  groupId: 'schema-group',
  registry: registry.getRegistry(),
  onMessage: async ({ message }) => {
    // message.value is auto-deserialized to the schema type
    console.log(message.value.id, message.value.status);
    await message.commit();
  },
});

await consumer.start({ topics: ['orders'] });
```

## Using Helpers with IGNIS IoC

```typescript
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
  KafkaAdminHelper,
} from '@venizia/ignis-helpers/kafka';
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';
import { inject, injectable } from '@venizia/ignis-inversion';

// Register helpers in the IoC container
app.bind('kafka.producer').to(
  KafkaProducerHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'order-service-producer',
    serializers: stringSerializers,
    onBrokerConnect: ({ broker }) => console.log(`Producer -> ${broker.host}`),
  }),
);

app.bind('kafka.consumer').to(
  KafkaConsumerHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'order-service-consumer',
    groupId: 'order-service',
    deserializers: stringDeserializers,
    onMessage: async ({ message }) => {
      // Handled by the service below
    },
    onBrokerConnect: ({ broker }) => console.log(`Consumer -> ${broker.host}`),
  }),
);

// Inject into services
@injectable()
export class OrderEventService {
  constructor(
    @inject({ key: 'kafka.producer' }) private producer: KafkaProducerHelper,
    @inject({ key: 'kafka.consumer' }) private consumer: KafkaConsumerHelper,
  ) {}

  async publishOrderCreated(orderId: string, data: Record<string, unknown>) {
    await this.producer.getProducer().send({
      messages: [{ topic: 'order-events', key: orderId, value: JSON.stringify(data) }],
    });
  }

  async startConsuming() {
    await this.consumer.start({ topics: ['order-events'] });
  }
}
```

## Troubleshooting

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED localhost:9092` | Broker `advertised.listeners` set to `localhost` but connecting remotely | Set `KAFKA_ADVERTISED_LISTENERS` with the correct external host IP |
| `Request timed out` | SASL handshake or broker unreachable | Add `connectTimeout: 30_000, requestTimeout: 30_000` |
| `Connection closed` | Connecting without SASL to a SASL-required listener | Check `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` -- use `SASL_PLAINTEXT` |
| `Cannot find a suitable SASL mechanism` | Wrong mechanism (e.g., `PLAIN` when broker only supports `SCRAM-SHA-512`) | Check error message for supported mechanisms, match `mechanism` |
| `Failed to deserialize a message` | Mismatch between serializer and deserializer | Ensure matching serde. For old data, use a new consumer group or recreate topic |
| `JSON.stringify cannot serialize BigInt` | `message.offset` and `message.timestamp` are `bigint` | Use custom replacer: `(_k, v) => typeof v === 'bigint' ? v.toString() : v` |
| Consumer idle (no messages) | More consumers than partitions | Ensure `numPartitions >= numConsumers` |
| `isHealthy()` returns `false` | All brokers disconnected (a single idle disconnect won't trigger this) | Check broker addresses, SASL config, network connectivity. Use `getConnectedBrokerCount()` for details |
| `isReady()` returns `false` (consumer) | Consumer not active -- `start()` not called or stream closed | Call `await helper.start({ topics })` before checking readiness |
| Graceful shutdown timeout | In-flight requests taking too long | Increase `shutdownTimeout` or use `close({ isForce: true })` |

### Docker Kafka Configuration

When running Kafka in Docker and connecting from outside the container:

```yaml
environment:
  DOCKER_HOST_IP: '192.168.1.100'  # Your host machine's IP
  KAFKA_ADVERTISED_LISTENERS: >
    INTERNAL://kafka-1:29092,
    EXTERNAL://${DOCKER_HOST_IP}:19092
  KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: >
    INTERNAL:PLAINTEXT,
    EXTERNAL:SASL_PLAINTEXT,
    CONTROLLER:PLAINTEXT
```

- `INTERNAL` -- used for inter-broker communication
- `EXTERNAL` -- used for client connections from outside Docker
- `CONTROLLER` -- used for KRaft controller communication

## See Also

- **Kafka Pages:**
  - [Overview & Fundamentals](./) -- Connection, serialization, constants, compression
  - [Producer](./producer) -- Producer helper, transactions, API reference
  - [Consumer](./consumer) -- Consumer helper, callbacks, lag monitoring, API reference
  - [Admin](./admin) -- Admin helper & API reference
  - [Schema Registry](./schema-registry) -- Schema registry helper

- **Other Helpers:**
  - [Queue Helper](../queue/) -- BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) -- Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) -- Underlying Kafka client library
  - [Apache Kafka Documentation](https://kafka.apache.org/documentation/) -- Official Kafka docs
  - [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) -- New consumer group protocol
