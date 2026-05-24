/** Kafka Consumer Integration Test */

import { deserializersFrom, jsonDeserializer, stringDeserializer } from '@platformatic/kafka';
import { KafkaConsumerHelper } from '../../modules/queue/kafka';

// -------------------------------------------------------------------------
// Configuration — fill in your broker addresses and credentials
// -------------------------------------------------------------------------

const BROKERS = ['host1:19092', 'host2:19093', 'host3:19094'];

const SASL = {
  mechanism: 'SCRAM-SHA-512' as const,
  username: 'username',
  password: 'password',
};

const TOPIC = 'kaf-t1';
const CLIENT_ID = process.argv[2] ?? 'ignis-test-consumer';
const GROUP_ID = process.argv[3] ?? 'ignis-test-consumer-group';

// -------------------------------------------------------------------------
// Consumer
// -------------------------------------------------------------------------

async function main() {
  const consumer = KafkaConsumerHelper.newInstance({
    clientId: CLIENT_ID,
    bootstrapBrokers: BROKERS,
    groupId: GROUP_ID,
    deserializers: { ...deserializersFrom(jsonDeserializer), key: stringDeserializer },
    sasl: SASL,
    connectTimeout: 60_000,
    requestTimeout: 60_000,
    sessionTimeout: 90_000,
    heartbeatInterval: 10_000,
    autocommit: true,
    onMessage: async ({ message }) => {
      console.log(
        JSON.stringify(
          {
            client: CLIENT_ID,
            topic: message.topic,
            partition: message.partition,
            offset: message.offset,
            key: message.key,
            value: message.value,
            headers: Object.fromEntries(message.headers ?? new Map()),
            timestamp: message.timestamp,
          },
          (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
        ),
      );
    },
    onMessageError: ({ error }) => {
      console.error(`[${CLIENT_ID}] Stream error:`, error);
    },
    onBrokerConnect: () => {
      console.log(`[${CLIENT_ID}] Connected to Kafka.`);
    },
  });

  console.log(`[${CLIENT_ID}] Connecting to Kafka...`);

  await consumer.start({ topics: [TOPIC], fallbackMode: 'earliest' });

  console.log(`[${CLIENT_ID}] Subscribed to "${TOPIC}". Waiting for messages...\n`);

  process.on('SIGINT', async () => {
    console.log(`\n[${CLIENT_ID}] Shutting down...`);
    await consumer.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Consumer error:', err);
  process.exit(1);
});
