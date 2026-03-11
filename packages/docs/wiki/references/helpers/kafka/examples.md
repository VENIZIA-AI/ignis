# Examples & Troubleshooting

Complete examples and common issue resolution for the Kafka helpers.

## Producer: Interval-Based Message Sending

```typescript
import { Producer, serializersFrom, jsonSerializer, stringSerializer } from '@platformatic/kafka';

const producer = new Producer({
  clientId: 'interval-producer',
  bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
  serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'user', password: 'pass' },
  connectTimeout: 30_000,
  requestTimeout: 30_000,
});

let count = 0;
const interval = setInterval(async () => {
  const key = `key-${count % 3}`;
  const value = { index: count, timestamp: new Date().toISOString() };

  await producer.send({ messages: [{ topic: 'events', key, value }] });
  console.log(JSON.stringify({ topic: 'events', key, value }));
  count++;
}, 100);

process.on('SIGINT', async () => {
  clearInterval(interval);
  console.log(`Shutting down... (sent ${count} messages)`);
  await producer.close();
  process.exit(0);
});
```

## Consumer: Event-Based with Manual Commit

```typescript
import { Consumer, deserializersFrom, jsonDeserializer, stringDeserializer } from '@platformatic/kafka';

const consumer = new Consumer({
  clientId: 'event-consumer',
  bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
  groupId: 'processing-group',
  deserializers: { ...deserializersFrom(jsonDeserializer), key: stringDeserializer },
  sasl: { mechanism: 'SCRAM-SHA-512', username: 'user', password: 'pass' },
  connectTimeout: 30_000,
  requestTimeout: 30_000,
  autocommit: false,
});

const stream = await consumer.consume({
  topics: ['events'],
  mode: 'committed',
  fallbackMode: 'latest',
});

stream.on('data', (message) => {
  console.log(JSON.stringify({
    topic: message.topic,
    partition: message.partition,
    offset: message.offset,
    key: message.key,
    value: message.value,
    headers: Object.fromEntries(message.headers ?? new Map()),
    timestamp: message.timestamp,
  }, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));

  message.commit();
});

stream.on('error', (err) => console.error('Stream error:', err));

process.on('SIGINT', async () => {
  await stream.close();
  await consumer.close();
  process.exit(0);
});
```

## Admin: Topic Setup Script

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

async function setupTopics() {
  const helper = KafkaAdminHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'topic-setup',
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

  await helper.close();
}

setupTopics();
```

## Using Helpers with Ignis IoC

```typescript
import { KafkaProducerHelper, KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';
import { inject, injectable } from '@venizia/ignis-inversion';

@injectable()
export class OrderEventService {
  private producer: KafkaProducerHelper;
  private consumer: KafkaConsumerHelper;

  constructor(
    @inject({ key: 'kafka.producer' }) producer: KafkaProducerHelper,
    @inject({ key: 'kafka.consumer' }) consumer: KafkaConsumerHelper,
  ) {
    this.producer = producer;
    this.consumer = consumer;
  }

  async publishOrderCreated(orderId: string, data: Record<string, unknown>) {
    const producer = this.producer.getProducer();
    await producer.send({
      messages: [{ topic: 'order-events', key: orderId, value: JSON.stringify(data) }],
    });
  }

  async startConsuming() {
    const consumer = this.consumer.getConsumer();
    const stream = await consumer.consume({
      topics: ['order-events'],
      mode: 'committed',
      fallbackMode: 'latest',
    });

    for await (const message of stream) {
      await this.handleOrderEvent(message.key!, JSON.parse(message.value!));
      await message.commit();
    }
  }

  private async handleOrderEvent(orderId: string, data: Record<string, unknown>) {
    // Process order event
  }
}

// Register in application
app.bind('kafka.producer').to(
  KafkaProducerHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'order-service-producer',
    serializers: stringSerializers,
  }),
);

app.bind('kafka.consumer').to(
  KafkaConsumerHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'order-service-consumer',
    groupId: 'order-service',
    deserializers: stringDeserializers,
  }),
);
```

---

## Troubleshooting

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED localhost:9092` | Broker `advertised.listeners` set to `localhost` but connecting remotely | Set `KAFKA_ADVERTISED_LISTENERS` with the correct external host IP |
| `Request timed out` | SASL handshake or broker unreachable | Add `connectTimeout: 30_000, requestTimeout: 30_000` |
| `Connection closed` | Connecting without SASL to a SASL-required listener | Check `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` — use `SASL_PLAINTEXT` |
| `Cannot find a suitable SASL mechanism` | Wrong mechanism (e.g., `PLAIN` when broker only supports `SCRAM-SHA-512`) | Check error message for supported mechanisms, match `mechanism` |
| `Failed to deserialize a message` | Mismatch between serializer used for producing and deserializer used for consuming | Ensure matching serde. For old data, use a new consumer group or recreate topic |
| `JSON.stringify cannot serialize BigInt` | `message.offset` and `message.timestamp` are `bigint` | Use custom replacer: `(_k, v) => typeof v === 'bigint' ? v.toString() : v` |
| Consumer idle (no messages) | More consumers than partitions | Ensure `numPartitions >= numConsumers` |

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

- `INTERNAL` — used for inter-broker communication
- `EXTERNAL` — used for client connections from outside Docker
- `CONTROLLER` — used for KRaft controller communication

---

## See Also

- **Kafka Pages:**
  - [Overview & Fundamentals](./) — Connection, serialization, constants, compression
  - [Producer](./producer) — Producer helper & API reference
  - [Consumer](./consumer) — Consumer helper & API reference
  - [Admin](./admin) — Admin helper & API reference

- **Other Helpers:**
  - [Queue Helper](../queue/) — BullMQ, MQTT, and in-memory queues
  - [Redis Helper](../redis/) — Redis connection management

- **External Resources:**
  - [@platformatic/kafka](https://github.com/platformatic/kafka) — Underlying Kafka client library
  - [Apache Kafka Documentation](https://kafka.apache.org/documentation/) — Official Kafka docs
  - [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) — New consumer group protocol
