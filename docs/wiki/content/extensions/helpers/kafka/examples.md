---
title: Kafka Examples & Troubleshooting
description: A multi-topic admin setup script, wiring Kafka helpers into IGNIS IoC, and a common-error lookup table
difficulty: intermediate
---

# Examples & Troubleshooting

Two examples not covered on the reference pages, plus a lookup table for the errors you'll actually hit.

## Admin: Topic Setup Script

A deploy-time script that creates several topics with production configuration in one call. Run it once, from a `migrate` step or a CI job.

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

async function setupTopics() {
  const helper = KafkaAdminHelper.newInstance({
    bootstrapBrokers: ['localhost:9092'],
    clientId: 'topic-setup',
    onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}`),
  });

  const admin = helper.getAdmin();

  await admin.createTopics({
    topics: ['orders', 'inventory', 'notifications'],
    partitions: 6,
    replicas: 3,
    configs: [
      { name: 'retention.ms', value: '604800000' },
      { name: 'compression.type', value: 'zstd' },
    ],
  });

  const topics = await admin.listTopics({ includeInternals: false });
  console.log('Topics:', topics);
  console.log('Healthy:', helper.isHealthy());

  await helper.close();
}

setupTopics();
```

## Using Helpers with IGNIS IoC

Bind each helper once at boot. Inject it wherever you need to publish or consume - the same pattern IGNIS uses for every other connected resource.

```typescript
import {
  KafkaProducerHelper,
  KafkaConsumerHelper,
} from '@venizia/ignis-helpers/kafka';
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';
import { inject } from '@venizia/ignis-inversion';

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

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED localhost:9092` | Broker `advertised.listeners` set to `localhost` but you're connecting remotely | Set `KAFKA_ADVERTISED_LISTENERS` to the correct external host IP |
| `Request timed out` | SASL handshake stalled, or the broker is unreachable | Add `connectTimeout: 30_000, requestTimeout: 30_000` |
| `Connection closed` | Connecting without SASL to a SASL-required listener | Check `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` - use `SASL_PLAINTEXT` |
| `Cannot find a suitable SASL mechanism` | Wrong mechanism, e.g. `PLAIN` when the broker only supports `SCRAM-SHA-512` | Read the error for the supported mechanisms, match `mechanism` to one |
| `Failed to deserialize a message` | Serializer and deserializer don't match | Match the serde on both sides. For old data, use a new consumer group or recreate the topic |
| `JSON.stringify cannot serialize BigInt` | `message.offset` and `message.timestamp` are `bigint` | Use a custom replacer: `(_k, v) => typeof v === 'bigint' ? v.toString() : v` |
| Consumer sits idle, no messages | More consumers than partitions | Make sure `numPartitions >= numConsumers` |
| `isHealthy()` returns `false` | Every broker disconnected - one idle disconnect alone won't trigger this | Check broker addresses, SASL config, network. `getConnectedBrokerCount()` gives the exact count |
| `isReady()` returns `false` (consumer) | Consumer isn't active - `start()` was never called, or the stream closed | Call `await helper.start({ topics })` before checking readiness |
| Graceful shutdown times out | In-flight requests are taking too long | Raise `shutdownTimeout`, or call `close({ isForce: true })` |

### Docker Kafka Configuration

Connecting from outside a Dockerized Kafka needs two listeners: one for containers talking to each other, one for the host.

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

| Listener | Used for |
|---|---|
| `INTERNAL` | Inter-broker communication |
| `EXTERNAL` | Client connections from outside Docker |
| `CONTROLLER` | KRaft controller communication |

## See also

- [Kafka Overview](./) - the four helpers, shared health/close API, and the compile-binary caveat
- [Producer](./producer) - connection & SASL setup, serialization, compression, transactions
- [Consumer](./consumer) - message callbacks, automatic reconnect, lag monitoring
- [Admin](./admin) - topic, group, offset, ACL, and quota management
- [Schema Registry](./schema-registry) - schema-validated serialization
- [Compiling to a Single Binary](./compile-binary) - required if any example on this page ships inside a `bun build --compile` binary
- [Queue Helpers](../queue/) - BullMQ, MQTT, and the in-memory queue
- [Redis Helper](../redis/) - Redis connection management

**Files:**

- [`packages/helpers/src/modules/queue/kafka/producer.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/producer.ts) - `KafkaProducerHelper`
- [`packages/helpers/src/modules/queue/kafka/consumer.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/consumer.ts) - `KafkaConsumerHelper`
- [`packages/helpers/src/modules/queue/kafka/admin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/admin.ts) - `KafkaAdminHelper`
- [`packages/helpers/src/modules/queue/kafka/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/index.ts) - the `/kafka` sub-path barrel
