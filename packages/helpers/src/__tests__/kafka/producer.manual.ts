/** Kafka Producer Integration Test */

import { jsonSerializer, serializersFrom, stringSerializer } from '@platformatic/kafka';
import { KafkaProducerHelper } from '../../modules/queue/kafka';

// --- Configuration - fill in your broker addresses and credentials ---

const BROKERS = ['host1:19092', 'host2:19093', 'host3:19094'];

const SASL = {
  mechanism: 'SCRAM-SHA-512' as const,
  username: 'username',
  password: 'password',
};

const TOPIC = 'kaf-t1';
const CLIENT_ID = process.argv[2] ?? 'ignis-test-producer';
const INTERVAL_MS = Number(process.argv[3]) || 5000;

// --- Producer ---

async function main() {
  const producer = KafkaProducerHelper.newInstance({
    clientId: CLIENT_ID,
    bootstrapBrokers: BROKERS,
    serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
    sasl: SASL,
    connectTimeout: 60_000,
    requestTimeout: 60_000,
    onBrokerConnect: () => {
      console.log(`[${CLIENT_ID}] Connected to Kafka.`);
    },
  });

  console.log(`[${CLIENT_ID}] Connecting to Kafka... (interval: ${INTERVAL_MS}ms)`);

  let count = 0;

  const interval = setInterval(async () => {
    console.log(producer.getProducer().isConnected());
    console.log(producer.getHealthStatus());

    if (!producer.isHealthy()) {
      console.warn('Kafka Producer not healthy after timeout');
    }
    if (!producer.isReady()) {
      console.warn('Kafka Producer not ready after timeout');
    }

    const key = `key-${count % 2}`;
    const value = { index: count, producer: CLIENT_ID, timestamp: new Date().toISOString() };

    await producer.getProducer().send({
      messages: [{ topic: TOPIC, key, value }],
    });

    console.log(JSON.stringify({ client: CLIENT_ID, topic: TOPIC, key, value }));
    count++;
  }, INTERVAL_MS);

  process.on('SIGINT', async () => {
    clearInterval(interval);
    console.log(`\n[${CLIENT_ID}] Shutting down... (sent ${count} messages)`);
    await producer.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Producer error:', err);
  process.exit(1);
});
