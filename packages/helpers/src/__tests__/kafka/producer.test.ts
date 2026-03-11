/** Kafka Producer Integration Test */

import { Producer, serializersFrom, jsonSerializer, stringSerializer } from '@platformatic/kafka';

// -------------------------------------------------------------------------
// Configuration — fill in your broker addresses and credentials
// -------------------------------------------------------------------------

const BROKERS = ['103.176.145.66:19092', '103.176.145.66:19093', '103.176.145.66:19094'];

const SASL = {
  mechanism: 'SCRAM-SHA-512' as const,
  username: 'nx.dev',
  password: 'Eventry.Dev.2k',
};

const TOPIC = 'nx-kaf-t1';
const CLIENT_ID = process.argv[2] ?? 'ignis-test-producer';
const INTERVAL_MS = Number(process.argv[3]) || 1;

// -------------------------------------------------------------------------
// Producer
// -------------------------------------------------------------------------

async function main() {
  const producer = new Producer({
    clientId: CLIENT_ID,
    bootstrapBrokers: BROKERS,
    serializers: { ...serializersFrom(jsonSerializer), key: stringSerializer },
    sasl: SASL,
    connectTimeout: 30_000,
    requestTimeout: 30_000,
    // tls: true, // Uncomment if your brokers require TLS
  });

  console.log(`[${CLIENT_ID}] Connecting to Kafka... (interval: ${INTERVAL_MS}ms)`);

  let count = 0;

  const interval = setInterval(async () => {
    const key = `key-${count % 2}`;
    const value = { index: count, producer: CLIENT_ID, timestamp: new Date().toISOString() };

    await producer.send({
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
