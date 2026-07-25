import type { AnyType } from '@/common/types';
/** LIVE Kafka integration tests, gated on APP_ENV_KAFKA_BROKERS (+ SASL vars) so they auto-skip when unconfigured; a per-test timeout makes a hung path fail loudly instead of stalling the runner. */

import { KafkaAdminHelper, KafkaConsumerHelper, KafkaProducerHelper } from '@/modules/queue/kafka';
import type { SASLOptions } from '@platformatic/kafka';
import { stringDeserializer, stringSerializer } from '@platformatic/kafka';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

// --- Config from env (no secrets in the repo) ---

const BROKERS = (process.env.APP_ENV_KAFKA_BROKERS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const SASL: SASLOptions | undefined =
  process.env.APP_ENV_KAFKA_SASL_ENABLE === 'true'
    ? {
        mechanism: (process.env.APP_ENV_KAFKA_SASL_MECHANISM ??
          'SCRAM-SHA-512') as SASLOptions['mechanism'],
        username: process.env.APP_ENV_KAFKA_SASL_USERNAME ?? '',
        password: process.env.APP_ENV_KAFKA_SASL_PASSWORD ?? '',
      }
    : undefined;

const CLIENT_ID = process.env.APP_ENV_KAFKA_CLIENT_ID ?? 'ignis-it';
const isLive = BROKERS.length > 0;
const live = isLive ? test : test.skip;

const RUN = Date.now();
const TIMEOUT = 45_000;

if (!isLive) {
  console.warn('[kafka.integration] APP_ENV_KAFKA_BROKERS not set — skipping live Kafka tests');
}

// --- Shared helpers ---

const baseConn = () => ({
  clientId: CLIENT_ID,
  bootstrapBrokers: BROKERS,
  sasl: SASL,
  connectTimeout: 15_000,
  requestTimeout: 15_000,
});

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT[${label}] ${ms}ms`)), ms),
    ),
  ]);

const createdTopics: string[] = [];
let topicSeq = 0;
const freshTopicName = (): string => {
  topicSeq += 1;
  const name = `ignis-it-${RUN}-${topicSeq}`;
  createdTopics.push(name);
  return name;
};

let admin: KafkaAdminHelper;
let producer: KafkaProducerHelper;

const createTopic = async (topic: string, partitions = 1): Promise<void> => {
  await withTimeout(
    admin.getAdmin().createTopics({ topics: [topic], partitions, replicas: 1 }),
    20_000,
    `createTopic ${topic}`,
  );
};

beforeAll(async () => {
  if (!isLive) {
    return;
  }
  admin = KafkaAdminHelper.newInstance({ ...baseConn(), identifier: 'it-admin' });
  producer = KafkaProducerHelper.newInstance({
    ...baseConn(),
    identifier: 'it-producer',
    // Header serializers are required to send string-valued headers.
    serializers: {
      key: stringSerializer,
      value: stringSerializer,
      headerKey: stringSerializer,
      headerValue: stringSerializer,
    },
    acks: -1,
    autocreateTopics: true,
  });
  // Force a connection so health assertions are meaningful.
  await withTimeout(admin.getAdmin().listTopics({}), 20_000, 'beforeAll listTopics');
}, 60_000);

afterAll(async () => {
  if (!isLive) {
    return;
  }
  if (createdTopics.length) {
    await withTimeout(
      admin.getAdmin().deleteTopics({ topics: createdTopics }),
      30_000,
      'afterAll deleteTopics',
    ).catch(() => {
      /* best-effort cleanup */
    });
  }
  await withTimeout(producer.close({ isForce: true }), 10_000, 'afterAll producer.close').catch(
    () => {},
  );
  await withTimeout(admin.close({ isForce: true }), 10_000, 'afterAll admin.close').catch(() => {});
}, 60_000);

// --- Admin ---

describe('KafkaAdminHelper (live)', () => {
  live(
    'IT-A01: connects and lists topics; reports healthy',
    async () => {
      const topics = await withTimeout(admin.getAdmin().listTopics({}), 20_000, 'listTopics');
      expect(Array.isArray(topics)).toBe(true);
      expect(admin.getConnectedBrokerCount()).toBeGreaterThan(0);
      expect(admin.isHealthy()).toBe(true);
    },
    TIMEOUT,
  );

  live(
    'IT-A02: creates a topic that then appears in listTopics',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic, 2);
      const topics = (await withTimeout(
        admin.getAdmin().listTopics({}),
        20_000,
        'listTopics',
      )) as string[];
      expect(topics).toContain(topic);
    },
    TIMEOUT,
  );

  live(
    'IT-A03: lists consumer groups (array)',
    async () => {
      const groups = await withTimeout(admin.getAdmin().listGroups({}), 20_000, 'listGroups');
      expect(groups).toBeDefined();
    },
    TIMEOUT,
  );
});

// --- Producer ---

describe('KafkaProducerHelper (live)', () => {
  live(
    'IT-P01: sends a single message and is healthy afterwards',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      await withTimeout(
        producer.getProducer().send({ messages: [{ topic, key: 'k1', value: 'v1' }] }),
        15_000,
        'send-single',
      );
      expect(producer.isHealthy()).toBe(true);
    },
    TIMEOUT,
  );

  live(
    'IT-P02: sends a batch with keys and headers',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      await withTimeout(
        producer.getProducer().send({
          messages: [
            { topic, key: 'a', value: '1', headers: new Map([['h', 'x']]) },
            { topic, key: 'b', value: '2' },
            { topic, key: 'c', value: '3' },
          ],
        }),
        15_000,
        'send-batch',
      );
      expect(producer.isHealthy()).toBe(true);
    },
    TIMEOUT,
  );

  live(
    'IT-P03: runInTransaction commits produced messages',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      const txProducer = KafkaProducerHelper.newInstance({
        ...baseConn(),
        identifier: 'it-tx-commit',
        serializers: { key: stringSerializer, value: stringSerializer },
        idempotent: true,
        transactionalId: `ignis-it-tx-${RUN}-commit`,
        acks: -1,
        autocreateTopics: true,
      });
      try {
        const result = await withTimeout(
          txProducer.runInTransaction(async ({ send }) => {
            await send({ messages: [{ topic, key: 'tx', value: 'committed' }] });
            return 'ok';
          }),
          30_000,
          'tx-commit',
        );
        expect(result).toBe('ok');
      } finally {
        await withTimeout(txProducer.close({ isForce: true }), 10_000, 'tx.close').catch(() => {});
      }
    },
    TIMEOUT,
  );

  live(
    'IT-P04: runInTransaction aborts and rethrows when the callback throws',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      const txProducer = KafkaProducerHelper.newInstance({
        ...baseConn(),
        identifier: 'it-tx-abort',
        serializers: { key: stringSerializer, value: stringSerializer },
        idempotent: true,
        transactionalId: `ignis-it-tx-${RUN}-abort`,
        acks: -1,
        autocreateTopics: true,
      });
      try {
        let didThrow = false;
        try {
          await withTimeout(
            txProducer.runInTransaction(async ({ send }) => {
              await send({ messages: [{ topic, key: 'tx', value: 'aborted' }] });
              throw new Error('force-abort');
            }),
            30_000,
            'tx-abort',
          );
        } catch (error) {
          didThrow = true;
          expect((error as Error).message).toBe('force-abort');
        }
        expect(didThrow).toBe(true);
      } finally {
        await withTimeout(txProducer.close({ isForce: true }), 10_000, 'tx.close').catch(() => {});
      }
    },
    TIMEOUT,
  );
});

// --- Consumer ---

const makeConsumer = (
  onMessage: KafkaConsumerHelper['onMessage'],
  extra?: Record<string, unknown>,
): KafkaConsumerHelper =>
  KafkaConsumerHelper.newInstance({
    ...baseConn(),
    identifier: `it-consumer-${topicSeq}`,
    groupId: `ignis-it-grp-${RUN}-${topicSeq}`,
    deserializers: { key: stringDeserializer, value: stringDeserializer },
    sessionTimeout: 10_000,
    heartbeatInterval: 3_000,
    onMessage,
    ...extra,
  });

describe('KafkaConsumerHelper (live)', () => {
  live(
    'IT-C01: round-trip — produces N messages and consumes all of them',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);

      const N = 5;
      const values = Array.from({ length: N }, (_v, i) => `msg-${i}`);
      await withTimeout(
        producer.getProducer().send({
          messages: values.map((value, i) => ({ topic, key: `k${i}`, value })),
        }),
        15_000,
        'produce-roundtrip',
      );

      const got = new Set<string>();
      let resolveAll!: () => void;
      const allReceived = new Promise<void>(resolve => {
        resolveAll = resolve;
      });
      const consumer = makeConsumer(async ({ message }) => {
        got.add(String(message.value));
        if (got.size >= N) {
          resolveAll();
        }
      });

      try {
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'earliest' }),
          25_000,
          'start',
        );
        await withTimeout(allReceived, 25_000, 'receive-all');
        for (const value of values) {
          expect(got.has(value)).toBe(true);
        }
      } finally {
        await withTimeout(consumer.close(), 15_000, 'consumer.close').catch(() => {});
      }
    },
    TIMEOUT,
  );

  live(
    'IT-C02: fires onMessageDone and onGroupJoin callbacks',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      await withTimeout(
        producer.getProducer().send({ messages: [{ topic, key: 'k', value: 'done' }] }),
        15_000,
        'produce',
      );

      let didJoin = false;
      let doneCount = 0;
      let resolveDone!: () => void;
      const donePromise = new Promise<void>(resolve => {
        resolveDone = resolve;
      });
      const consumer = makeConsumer(
        async () => {
          /* handled */
        },
        {
          onGroupJoin: () => {
            didJoin = true;
          },
          onMessageDone: async () => {
            doneCount += 1;
            resolveDone();
          },
        },
      );

      try {
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'earliest' }),
          25_000,
          'start',
        );
        await withTimeout(donePromise, 25_000, 'done');
        expect(didJoin).toBe(true);
        expect(doneCount).toBeGreaterThan(0);
      } finally {
        await withTimeout(consumer.close(), 15_000, 'consumer.close').catch(() => {});
      }
    },
    TIMEOUT,
  );

  live(
    'IT-C03: invokes onMessageError when the handler throws and keeps consuming',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      await withTimeout(
        producer.getProducer().send({ messages: [{ topic, key: 'k', value: 'boom' }] }),
        15_000,
        'produce',
      );

      let errorSeen: Error | null = null;
      let resolveErr!: () => void;
      const errPromise = new Promise<void>(resolve => {
        resolveErr = resolve;
      });
      const consumer = makeConsumer(
        async () => {
          throw new Error('handler-failure');
        },
        {
          onMessageError: ({ error }: { error: Error }) => {
            errorSeen = error;
            resolveErr();
          },
        },
      );

      try {
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'earliest' }),
          25_000,
          'start',
        );
        await withTimeout(errPromise, 25_000, 'error');
        expect(errorSeen).not.toBeNull();
        expect((errorSeen as AnyType as Error).message).toBe('handler-failure');
      } finally {
        await withTimeout(consumer.close(), 15_000, 'consumer.close').catch(() => {});
      }
    },
    TIMEOUT,
  );

  live(
    'IT-C04: manual commit suppresses redelivery to the same group',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      await withTimeout(
        producer.getProducer().send({ messages: [{ topic, key: 'k', value: 'commit-me' }] }),
        15_000,
        'produce',
      );

      const groupId = `ignis-it-commit-${RUN}`;

      // First consumer: consume one message and commit its offset.
      let resolveFirst!: () => void;
      const firstReceived = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });
      const first = KafkaConsumerHelper.newInstance({
        ...baseConn(),
        identifier: 'it-commit-1',
        groupId,
        deserializers: { key: stringDeserializer, value: stringDeserializer },
        sessionTimeout: 10_000,
        heartbeatInterval: 3_000,
        autocommit: false,
        onMessage: async ({ message }) => {
          await message.commit();
          resolveFirst();
        },
      });
      try {
        await withTimeout(
          first.start({ topics: [topic], fallbackMode: 'earliest' }),
          25_000,
          'first.start',
        );
        await withTimeout(firstReceived, 25_000, 'first.receive');
      } finally {
        await withTimeout(first.close(), 15_000, 'first.close').catch(() => {});
      }

      // Second consumer, same group, committed mode: should NOT see the message again.
      let didRedeliver = false;
      const second = KafkaConsumerHelper.newInstance({
        ...baseConn(),
        identifier: 'it-commit-2',
        groupId,
        deserializers: { key: stringDeserializer, value: stringDeserializer },
        sessionTimeout: 10_000,
        heartbeatInterval: 3_000,
        autocommit: false,
        onMessage: async () => {
          didRedeliver = true;
        },
      });
      try {
        await withTimeout(
          second.start({ topics: [topic], mode: 'committed', fallbackMode: 'latest' }),
          25_000,
          'second.start',
        );
        // Give it time to (not) redeliver.
        await new Promise(resolve => setTimeout(resolve, 6_000));
        expect(didRedeliver).toBe(false);
      } finally {
        await withTimeout(second.close(), 15_000, 'second.close').catch(() => {});
      }
    },
    60_000,
  );

  live(
    'IT-C05: start() is idempotent (duplicate start is ignored)',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      const consumer = makeConsumer(async () => {
        /* noop */
      });
      try {
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'latest' }),
          25_000,
          'start1',
        );
        const stream1 = consumer.getStream();
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'latest' }),
          25_000,
          'start2',
        );
        const stream2 = consumer.getStream();
        expect(stream1).toBe(stream2);
      } finally {
        await withTimeout(consumer.close(), 15_000, 'consumer.close').catch(() => {});
      }
    },
    TIMEOUT,
  );

  live(
    'IT-C06: graceful close terminates promptly without hanging',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      const consumer = makeConsumer(async () => {
        /* idle */
      });
      await withTimeout(
        consumer.start({ topics: [topic], fallbackMode: 'latest' }),
        25_000,
        'start',
      );

      const t0 = Date.now();
      await withTimeout(consumer.close(), 15_000, 'close-no-hang');
      // Graceful close should return well within the shutdown timeout.
      expect(Date.now() - t0).toBeLessThan(15_000);
    },
    TIMEOUT,
  );

  live(
    'IT-C07: lag monitoring start/stop is safe and idempotent',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      const consumer = makeConsumer(async () => {
        /* noop */
      });
      try {
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'latest' }),
          25_000,
          'start',
        );
        expect(() =>
          consumer.startLagMonitoring({ topics: [topic], interval: 2_000 }),
        ).not.toThrow();
        expect(() => consumer.startLagMonitoring({ topics: [topic] })).not.toThrow(); // duplicate
        await new Promise(resolve => setTimeout(resolve, 3_000));
        expect(() => consumer.stopLagMonitoring()).not.toThrow();
        expect(() => consumer.stopLagMonitoring()).not.toThrow(); // duplicate
      } finally {
        await withTimeout(consumer.close(), 15_000, 'consumer.close').catch(() => {});
      }
    },
    TIMEOUT,
  );

  live(
    'IT-C08: reconnect cycles do not leak consumer listeners (no removeAllListeners needed)',
    async () => {
      const topic = freshTopicName();
      await createTopic(topic);
      // No onMessage means no background consume loop, so the reconnect path can be driven manually in isolation; onMessageError attaches a per-stream 'error' listener that absorbs the synthetic destroy() error.
      const consumer = KafkaConsumerHelper.newInstance({
        ...baseConn(),
        identifier: 'it-leak',
        groupId: `ignis-it-leak-${RUN}`,
        deserializers: { key: stringDeserializer, value: stringDeserializer },
        sessionTimeout: 10_000,
        heartbeatInterval: 3_000,
        onMessageError: () => {
          /* absorb */
        },
      });
      try {
        await withTimeout(
          consumer.start({ topics: [topic], fallbackMode: 'latest' }),
          25_000,
          'start',
        );

        const client = consumer.getConsumer();
        // Per-stream listeners `MessagesStream` registers on the consumer are cleaned up by the stream's own `_destroy()` (triggered by destroy()), NOT by removeAllListeners(); with one stream active this is the steady-state max.
        const liveCounts = () => ({
          join: client.listenerCount('consumer:group:join'),
          disc: client.listenerCount('client:broker:disconnect'),
        });
        const baseline = liveCounts();

        // Drive the real reconnect path - tear the stream down, then rebuild; the settle delay mirrors the real reconnectDelayMs and lets each stream's async _destroy() remove its per-stream consumer listeners.
        for (let i = 0; i < 6; i++) {
          consumer['destroyDeadStream']();
          await new Promise(resolve => setTimeout(resolve, 400));
          await consumer['attemptReconnect']({ attempt: i + 1, maxAttempts: 999, delayMs: 0 });
          await new Promise(resolve => setTimeout(resolve, 400));
        }

        // Steady state after cycling must return to the single-stream baseline - _destroy() reclaimed every old stream's listeners, no removeAllListeners needed.
        const settled = liveCounts();
        expect(settled.join).toBe(baseline.join);
        expect(settled.disc).toBe(baseline.disc);
      } finally {
        await withTimeout(consumer.close(), 15_000, 'consumer.close').catch(() => {});
      }
    },
    60_000,
  );
});

// --- Negative / resilience ---

describe('Kafka resilience (live config, bad endpoint)', () => {
  live(
    'IT-R01: connecting to an unreachable broker fails fast (no hang)',
    async () => {
      const badAdmin = KafkaAdminHelper.newInstance({
        clientId: 'it-bad',
        bootstrapBrokers: ['127.0.0.1:1'],
        connectTimeout: 2_000,
        requestTimeout: 2_000,
        retries: 0,
      });
      let didFail = false;
      try {
        await withTimeout(badAdmin.getAdmin().listTopics({}), 12_000, 'bad-listTopics');
      } catch {
        didFail = true;
      }
      expect(didFail).toBe(true);
      expect(badAdmin.isHealthy()).toBe(false);
      await withTimeout(badAdmin.close({ isForce: true }), 8_000, 'bad.close').catch(() => {});
    },
    TIMEOUT,
  );
});
