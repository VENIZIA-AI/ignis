/** Kafka Consumer Integration Test */

import {
  Consumer,
  deserializersFrom,
  jsonDeserializer,
  stringDeserializer,
} from '@platformatic/kafka';

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
const CLIENT_ID = process.argv[2] ?? 'ignis-test-consumer';
const GROUP_ID = process.argv[3] ?? 'ignis-test-consumer-group';

// -------------------------------------------------------------------------
// Consumer
// -------------------------------------------------------------------------

async function main() {
  const consumer = new Consumer({
    clientId: CLIENT_ID,
    bootstrapBrokers: BROKERS,
    groupId: GROUP_ID,
    deserializers: { ...deserializersFrom(jsonDeserializer), key: stringDeserializer },
    sasl: SASL,
    connectTimeout: 30_000,
    requestTimeout: 30_000,
    // tls: true, // Uncomment if your brokers require TLS
    autocommit: false,
  });

  console.log(`[${CLIENT_ID}] Connecting to Kafka...`);

  const stream = await consumer.consume({
    topics: [TOPIC],
    mode: 'committed',
    fallbackMode: 'latest',
  });

  console.log(`[${CLIENT_ID}] Subscribed to "${TOPIC}". Waiting for messages...\n`);

  stream.on('data', message => {
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
    message.commit();
  });

  stream.on('error', err => {
    console.error(`[${CLIENT_ID}] Stream error:`, err);
  });

  process.on('SIGINT', async () => {
    console.log(`\n[${CLIENT_ID}] Shutting down...`);
    await stream.close();
    await consumer.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Consumer error:', err);
  process.exit(1);
});
