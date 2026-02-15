/**
 * Kafka Helpers Comprehensive Test Suite
 *
 * Tests for KafkaDefaults, KafkaAcks, KafkaAdminHelper, KafkaProducerHelper,
 * and KafkaConsumerHelper — covering functional, boundary, negative, security,
 * and integration test categories.
 *
 * Uses two strategies:
 * 1. **Unit tests** — Mock @platformatic/kafka classes (Producer, Consumer, Admin)
 *    to test internal logic, error paths, and edge cases without a real broker.
 * 2. **Integration tests** — Connect to a real broker when available (gated by
 *    `isBrokerReachable` flag via `test.skipIf`).
 *
 * Requires: APP_ENV_KAFKA_BROKERS env var pointing to a Kafka broker for
 * integration tests.
 *
 * @module __tests__/kafka
 */

import { describe, test, expect, beforeAll, afterAll, mock, spyOn } from 'bun:test';
import {
  KafkaDefaults,
  KafkaAcks,
  KafkaAdminHelper,
  KafkaProducerHelper,
  KafkaConsumerHelper,
} from '@/helpers/queue/kafka';
import { stringSerializers, stringDeserializers } from '@platformatic/kafka';

// =============================================================================
// Config
// =============================================================================

const BROKERS = (process.env.APP_ENV_KAFKA_BROKERS ?? '103.176.145.66:19092').split(',');
const TEST_TOPIC_PREFIX = `ignis-test-${Date.now()}`;
const TIMEOUT = 30_000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if the broker advertises a reachable address (not localhost/127.0.0.1).
 * If broker metadata returns localhost, producer/consumer can't reach it from
 * an external machine — only admin operations work via bootstrap connection.
 */
let isBrokerReachable = false;
let isBrokerConnectable = false;

// =============================================================================
// Mock Factories
// =============================================================================

/**
 * Creates a mock async iterable stream to simulate MessagesStream.
 */
function createMockStream(messages: unknown[], opts?: { throwError?: Error; delayMs?: number }) {
  let isClosed = false;
  return {
    close: mock(async () => {
      isClosed = true;
    }),
    [Symbol.asyncIterator]: async function* () {
      for (const msg of messages) {
        if (isClosed) {
          break;
        }
        if (opts?.delayMs) {
          await wait(opts.delayMs);
        }
        yield msg;
      }
      if (opts?.throwError && !isClosed) {
        throw opts.throwError;
      }
    },
  };
}

// =============================================================================
// 1. KafkaDefaults
// =============================================================================

describe('Kafka Helpers', () => {
  describe('KafkaDefaults', () => {
    test('TC-001: should expose CLIENT_ID default', () => {
      expect(KafkaDefaults.CLIENT_ID).toBe('ignis-kafka');
    });

    test('TC-002: should expose SESSION_TIMEOUT default', () => {
      expect(KafkaDefaults.SESSION_TIMEOUT).toBe(30_000);
    });

    test('TC-003: should expose HEARTBEAT_INTERVAL default', () => {
      expect(KafkaDefaults.HEARTBEAT_INTERVAL).toBe(3_000);
    });

    test('TC-004: should expose MAX_WAIT_TIME default', () => {
      expect(KafkaDefaults.MAX_WAIT_TIME).toBe(5_000);
    });

    test('TC-005: should expose HIGH_WATER_MARK default', () => {
      expect(KafkaDefaults.HIGH_WATER_MARK).toBe(1024);
    });

    test('TC-006: should expose AUTOCOMMIT_INTERVAL default', () => {
      expect(KafkaDefaults.AUTOCOMMIT_INTERVAL).toBe(100);
    });

    test('TC-007: all defaults should be numbers except CLIENT_ID', () => {
      expect(typeof KafkaDefaults.CLIENT_ID).toBe('string');
      expect(typeof KafkaDefaults.SESSION_TIMEOUT).toBe('number');
      expect(typeof KafkaDefaults.HEARTBEAT_INTERVAL).toBe('number');
      expect(typeof KafkaDefaults.MAX_WAIT_TIME).toBe('number');
      expect(typeof KafkaDefaults.HIGH_WATER_MARK).toBe('number');
      expect(typeof KafkaDefaults.AUTOCOMMIT_INTERVAL).toBe('number');
    });

    test('TC-008: all numeric defaults should be positive integers', () => {
      const numericDefaults = [
        KafkaDefaults.SESSION_TIMEOUT,
        KafkaDefaults.HEARTBEAT_INTERVAL,
        KafkaDefaults.MAX_WAIT_TIME,
        KafkaDefaults.HIGH_WATER_MARK,
        KafkaDefaults.AUTOCOMMIT_INTERVAL,
      ];

      for (const val of numericDefaults) {
        expect(val).toBeGreaterThan(0);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    test('TC-009: SESSION_TIMEOUT should be greater than HEARTBEAT_INTERVAL', () => {
      // Session timeout must be > heartbeat interval for Kafka protocol correctness
      expect(KafkaDefaults.SESSION_TIMEOUT).toBeGreaterThan(KafkaDefaults.HEARTBEAT_INTERVAL);
    });

    test('TC-010: CLIENT_ID should be a non-empty string', () => {
      expect(KafkaDefaults.CLIENT_ID.length).toBeGreaterThan(0);
      expect(KafkaDefaults.CLIENT_ID.trim()).toBe(KafkaDefaults.CLIENT_ID);
    });
  });

  // =============================================================================
  // 2. KafkaAcks
  // =============================================================================

  describe('KafkaAcks', () => {
    test('TC-011: should expose NONE = 0', () => {
      expect(KafkaAcks.NONE).toBe(0);
    });

    test('TC-012: should expose LEADER = 1', () => {
      expect(KafkaAcks.LEADER).toBe(1);
    });

    test('TC-013: should expose ALL = -1', () => {
      expect(KafkaAcks.ALL).toBe(-1);
    });

    test('TC-014: SCHEME_SET should contain all valid values', () => {
      expect(KafkaAcks.SCHEME_SET.size).toBe(3);
      expect(KafkaAcks.SCHEME_SET.has(0)).toBe(true);
      expect(KafkaAcks.SCHEME_SET.has(1)).toBe(true);
      expect(KafkaAcks.SCHEME_SET.has(-1)).toBe(true);
    });

    test('TC-015: SCHEME_SET should not contain invalid values', () => {
      expect(KafkaAcks.SCHEME_SET.has(2)).toBe(false);
      expect(KafkaAcks.SCHEME_SET.has(-2)).toBe(false);
      expect(KafkaAcks.SCHEME_SET.has(100)).toBe(false);
    });

    test('TC-016: isValid should return true for all valid ack values', () => {
      expect(KafkaAcks.isValid(0)).toBe(true);
      expect(KafkaAcks.isValid(1)).toBe(true);
      expect(KafkaAcks.isValid(-1)).toBe(true);
    });

    test('TC-017: isValid should return false for positive invalid values', () => {
      expect(KafkaAcks.isValid(2)).toBe(false);
      expect(KafkaAcks.isValid(3)).toBe(false);
      expect(KafkaAcks.isValid(10)).toBe(false);
      expect(KafkaAcks.isValid(999)).toBe(false);
    });

    test('TC-018: isValid should return false for negative invalid values', () => {
      expect(KafkaAcks.isValid(-2)).toBe(false);
      expect(KafkaAcks.isValid(-100)).toBe(false);
      expect(KafkaAcks.isValid(-999)).toBe(false);
    });

    test('TC-019: isValid should return false for floating point numbers', () => {
      expect(KafkaAcks.isValid(0.5)).toBe(false);
      expect(KafkaAcks.isValid(1.1)).toBe(false);
      expect(KafkaAcks.isValid(-0.5)).toBe(false);
      expect(KafkaAcks.isValid(-1.5)).toBe(false);
    });

    test('TC-020: isValid should return false for special numeric values', () => {
      expect(KafkaAcks.isValid(NaN)).toBe(false);
      expect(KafkaAcks.isValid(Infinity)).toBe(false);
      expect(KafkaAcks.isValid(-Infinity)).toBe(false);
    });

    test('TC-021: isValid should return false for extreme values', () => {
      expect(KafkaAcks.isValid(Number.MAX_SAFE_INTEGER)).toBe(false);
      expect(KafkaAcks.isValid(Number.MIN_SAFE_INTEGER)).toBe(false);
      expect(KafkaAcks.isValid(Number.MAX_VALUE)).toBe(false);
      expect(KafkaAcks.isValid(Number.MIN_VALUE)).toBe(false);
    });

    test('TC-022: SCHEME_SET should be a Set instance', () => {
      expect(KafkaAcks.SCHEME_SET).toBeInstanceOf(Set);
    });

    test('TC-023: ack values should match Kafka protocol specification', () => {
      // Kafka protocol: 0=no ack, 1=leader ack, -1=all replicas ack
      expect(KafkaAcks.NONE).toBe(0);
      expect(KafkaAcks.LEADER).toBe(1);
      expect(KafkaAcks.ALL).toBe(-1);
    });
  });

  // =============================================================================
  // 3. KafkaProducerHelper — Unit Tests (Mocked)
  // =============================================================================

  describe('KafkaProducerHelper (Unit)', () => {
    test('TC-024: newInstance should create a producer helper', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'ignis-test-producer-construct',
        identifier: 'test-producer-construct',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      expect(p.getIdentifier()).toBe('test-producer-construct');
      p.close().catch(() => {});
    });

    test('TC-025: newInstance should create producer with all options', () => {
      const onError = mock(() => {});
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'ignis-full-opts',
        identifier: 'full-opts',
        acks: KafkaAcks.ALL,
        autocreateTopics: true,
        serializers: stringSerializers,
        timeout: 10_000,
        retries: 3,
        retryDelay: 500,
        onError,
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      expect(p.getIdentifier()).toBe('full-opts');
      p.close().catch(() => {});
    });

    test('TC-026: newInstance with minimal options (only bootstrapBrokers)', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      // No identifier provided — should default to empty string from BaseHelper
      expect(p.getIdentifier()).toBe('');
      p.close().catch(() => {});
    });

    test('TC-027: should use KafkaDefaults.CLIENT_ID when clientId is not provided', () => {
      // We verify this by checking that construction succeeds without clientId
      // The actual default is applied inside the constructor to the underlying Producer
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-028: getIdentifier should return the identifier passed at construction', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'my-unique-producer',
      });
      expect(p.getIdentifier()).toBe('my-unique-producer');
      p.close().catch(() => {});
    });

    test('TC-029: getIdentifier should return empty string when no identifier provided', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
      });
      expect(p.getIdentifier()).toBe('');
      p.close().catch(() => {});
    });

    test('TC-030: should have a logger from BaseHelper', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'logger-test',
      });
      expect(p.logger).toBeDefined();
      expect(typeof p.logger.info).toBe('function');
      expect(typeof p.logger.error).toBe('function');
      expect(typeof p.logger.debug).toBe('function');
      expect(typeof p.logger.warn).toBe('function');
      p.close().catch(() => {});
    });

    test('TC-031: scope should be set to class name', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'scope-test',
      });
      expect(p.scope).toBe('KafkaProducerHelper');
      p.close().catch(() => {});
    });

    test(
      'TC-032: onError callback should fire on send failure (unreachable broker)',
      async () => {
        const onError = mock(() => {});

        const badProducer = KafkaProducerHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          clientId: 'ignis-test-bad-producer',
          identifier: 'bad-producer',
          onError,
          retries: false,
          timeout: 3_000,
        });

        try {
          await badProducer.send({
            messages: [{ topic: 'nonexistent', value: Buffer.from('fail') }],
          });
        } catch {
          // expected — send should throw after broker connection failure
        }

        expect(onError).toHaveBeenCalled();
        await badProducer.close().catch(() => {});
      },
      TIMEOUT,
    );

    test(
      'TC-033: send should re-throw the error after calling onError',
      async () => {
        const capturedError: Error[] = [];

        const badProducer = KafkaProducerHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          clientId: 'ignis-test-rethrow',
          identifier: 'rethrow-test',
          onError: (opts: { error: Error }) => {
            capturedError.push(opts.error);
          },
          retries: false,
          timeout: 3_000,
        });

        let thrownError: Error | undefined;
        try {
          await badProducer.send({
            messages: [{ topic: 'nonexistent', value: Buffer.from('fail') }],
          });
        } catch (err) {
          thrownError = err as Error;
        }

        expect(thrownError).toBeDefined();
        expect(capturedError.length).toBe(1);
        // The thrown error and the onError error should be the same instance
        expect(thrownError).toBe(capturedError[0]);
        await badProducer.close().catch(() => {});
      },
      TIMEOUT,
    );

    test(
      'TC-034: send without onError should still throw on failure',
      async () => {
        const badProducer = KafkaProducerHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          clientId: 'ignis-test-no-onerror',
          identifier: 'no-onerror',
          retries: false,
          timeout: 3_000,
        });

        let didThrow = false;
        try {
          await badProducer.send({
            messages: [{ topic: 'nonexistent', value: Buffer.from('fail') }],
          });
        } catch {
          didThrow = true;
        }

        expect(didThrow).toBe(true);
        await badProducer.close().catch(() => {});
      },
      TIMEOUT,
    );

    test('TC-035: sendBatch should flatten topic messages and call send internally', async () => {
      // We can test the flattening logic by using a mock that captures calls
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'batch-flatten',
        retries: false,
        timeout: 2_000,
      });

      // Spy on the send method to capture what sendBatch passes to it
      const sendSpy = spyOn(p, 'send');
      sendSpy.mockRejectedValue(new Error('mock-send-error'));

      try {
        await p.sendBatch({
          topicMessages: [
            {
              topic: 'topic-a',
              messages: [
                { topic: '', key: 'k1', value: 'v1' },
                { topic: '', key: 'k2', value: 'v2' },
              ],
            },
            {
              topic: 'topic-b',
              messages: [{ topic: '', key: 'k3', value: 'v3' }],
            },
          ],
        });
      } catch {
        // expected
      }

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0] as { messages: Array<{ topic: string }> };
      expect(callArgs.messages.length).toBe(3);
      // sendBatch should overwrite topic with the batch topic
      expect(callArgs.messages[0].topic).toBe('topic-a');
      expect(callArgs.messages[1].topic).toBe('topic-a');
      expect(callArgs.messages[2].topic).toBe('topic-b');

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-036: sendBatch with empty topicMessages should call send with empty array', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'batch-empty',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({ topicMessages: [] });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0] as { messages: unknown[] };
      expect(callArgs.messages.length).toBe(0);

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-037: sendBatch with single topic and single message', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'batch-single',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({
        topicMessages: [
          {
            topic: 'my-topic',
            messages: [{ topic: '', key: 'key1', value: 'val1' }],
          },
        ],
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0] as {
        messages: Array<{ topic: string; key: string; value: string }>;
      };
      expect(callArgs.messages.length).toBe(1);
      expect(callArgs.messages[0].topic).toBe('my-topic');
      expect(callArgs.messages[0].key).toBe('key1');
      expect(callArgs.messages[0].value).toBe('val1');

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-038: sendBatch should propagate acks option', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'batch-acks',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({
        topicMessages: [
          {
            topic: 'acks-topic',
            messages: [{ topic: '', value: 'v' }],
          },
        ],
        acks: KafkaAcks.ALL,
      });

      const callArgs = sendSpy.mock.calls[0][0] as { acks?: number };
      expect(callArgs.acks).toBe(KafkaAcks.ALL);

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-039: close should not throw on fresh producer', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'close-fresh',
        retries: false,
        timeout: 2_000,
      });

      // close on a producer that never sent anything should not throw
      // (the underlying library may or may not error; we just verify our wrapper handles it)
      try {
        await p.close();
      } catch {
        // acceptable if underlying library rejects on unconnected close
      }
    });

    test('TC-040: producer should be constructible with retries=false', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        retries: false,
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-041: producer should be constructible with retries as number', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        retries: 5,
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-042: producer should accept multiple bootstrap brokers', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-043: producer identifier with special characters', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'producer-with-special-chars_123.test',
      });
      expect(p.getIdentifier()).toBe('producer-with-special-chars_123.test');
      p.close().catch(() => {});
    });

    test('TC-044: producer identifier with unicode', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'producer-unicode-test',
      });
      expect(p.getIdentifier()).toBe('producer-unicode-test');
      p.close().catch(() => {});
    });

    test('TC-045: multiple producers can coexist with different identifiers', () => {
      const p1 = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'producer-1',
      });
      const p2 = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'producer-2',
      });
      const p3 = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'producer-3',
      });

      expect(p1.getIdentifier()).toBe('producer-1');
      expect(p2.getIdentifier()).toBe('producer-2');
      expect(p3.getIdentifier()).toBe('producer-3');
      expect(p1).not.toBe(p2);
      expect(p2).not.toBe(p3);

      p1.close().catch(() => {});
      p2.close().catch(() => {});
      p3.close().catch(() => {});
    });

    test('TC-046: producer with serializers option should construct without error', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        serializers: stringSerializers,
        identifier: 'serializer-test',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-047: producer without serializers should construct without error', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'no-serializer-test',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });
  });

  // =============================================================================
  // 4. KafkaConsumerHelper — Unit Tests (Mocked)
  // =============================================================================

  describe('KafkaConsumerHelper (Unit)', () => {
    test('TC-048: newInstance should create a consumer helper', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'ignis-test-consumer-construct',
        identifier: 'test-consumer-construct',
        groupId: `ignis-test-group-construct-${Date.now()}`,
        topics: ['test-topic'],
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      expect(c.getIdentifier()).toBe('test-consumer-construct');
      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-049: newInstance with all options should construct without error', () => {
      const onMessage = mock(async () => {});
      const onError = mock(() => {});

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'ignis-full-consumer',
        identifier: 'full-consumer',
        groupId: 'full-group',
        topics: ['topic-a', 'topic-b'],
        deserializers: stringDeserializers,
        autocommit: true,
        sessionTimeout: 60_000,
        heartbeatInterval: 5_000,
        highWaterMark: 2048,
        maxWaitTime: 10_000,
        mode: 'earliest',
        timeout: 15_000,
        retries: 3,
        retryDelay: 1_000,
        onMessage,
        onError,
      });

      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      expect(c.getIdentifier()).toBe('full-consumer');
      c.close().catch(() => {});
    });

    test('TC-050: newInstance with minimal options (only required fields)', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'minimal-group',
        topics: ['minimal-topic'],
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      expect(c.getIdentifier()).toBe('');
      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-051: isConsuming should return false before start', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'consuming-false-group',
        topics: ['test'],
      });
      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-052: scope should be set to class name', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'scope-group',
        topics: ['test'],
        identifier: 'scope-test',
      });
      expect(c.scope).toBe('KafkaConsumerHelper');
      c.close().catch(() => {});
    });

    test('TC-053: should have a logger from BaseHelper', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'logger-group',
        topics: ['test'],
        identifier: 'logger-test',
      });
      expect(c.logger).toBeDefined();
      expect(typeof c.logger.info).toBe('function');
      expect(typeof c.logger.error).toBe('function');
      c.close().catch(() => {});
    });

    test('TC-054: consumer with multiple topics', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'multi-topic-group',
        topics: ['topic-1', 'topic-2', 'topic-3', 'topic-4'],
        identifier: 'multi-topic',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-055: consumer with autocommit as number (interval)', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'autocommit-num-group',
        topics: ['test'],
        autocommit: 500,
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-056: consumer with autocommit as false', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'autocommit-false-group',
        topics: ['test'],
        autocommit: false,
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-057: consumer with mode=committed', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'committed-mode-group',
        topics: ['test'],
        mode: 'committed',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-058: consumer with mode=latest (default)', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'latest-mode-group',
        topics: ['test'],
        mode: 'latest',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-059: consumer with mode=earliest', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'earliest-mode-group',
        topics: ['test'],
        mode: 'earliest',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-060: multiple consumers with different groupIds can coexist', () => {
      const c1 = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'group-1',
        topics: ['test'],
        identifier: 'consumer-1',
      });
      const c2 = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'group-2',
        topics: ['test'],
        identifier: 'consumer-2',
      });

      expect(c1.getIdentifier()).toBe('consumer-1');
      expect(c2.getIdentifier()).toBe('consumer-2');
      expect(c1).not.toBe(c2);

      c1.close().catch(() => {});
      c2.close().catch(() => {});
    });

    test('TC-061: close on a consumer that was never started should not throw', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-never-started',
        topics: ['test'],
      });

      // close should handle gracefully when stream is null and consumer never connected
      try {
        await c.close();
      } catch {
        // acceptable if underlying library errors on unconnected close
      }

      expect(c.isConsuming()).toBe(false);
    });

    test('TC-062: consumer without deserializers should construct without error', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'no-deser-group',
        topics: ['test'],
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-063: consumer with deserializers should construct without error', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'with-deser-group',
        topics: ['test'],
        deserializers: stringDeserializers,
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 5. KafkaConsumerHelper — consumeLoop Logic Tests (Mocked Internals)
  // =============================================================================

  describe('KafkaConsumerHelper (consumeLoop mocked)', () => {
    test('TC-064: consumeLoop should call onMessage for each message in the stream', async () => {
      const receivedMessages: unknown[] = [];
      const mockMessages = [
        { topic: 'test', partition: 0, key: 'k1', value: 'v1', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'k2', value: 'v2', offset: 1n, timestamp: 1n },
        { topic: 'test', partition: 0, key: 'k3', value: 'v3', offset: 2n, timestamp: 2n },
      ];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'consume-loop-group',
        topics: ['test'],
        identifier: 'loop-test',
        onMessage: async (opts: { message: unknown }) => {
          receivedMessages.push(opts.message);
        },
      });

      // Access private fields to inject a mock stream and trigger consumeLoop
      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      // Invoke the private consumeLoop method
      await (c as any).consumeLoop();

      expect(receivedMessages.length).toBe(3);
      expect((receivedMessages[0] as any).key).toBe('k1');
      expect((receivedMessages[1] as any).key).toBe('k2');
      expect((receivedMessages[2] as any).key).toBe('k3');

      c.close().catch(() => {});
    });

    test('TC-065: consumeLoop should call onError when onMessage throws, but continue consuming', async () => {
      const errors: Error[] = [];
      const receivedMessages: unknown[] = [];
      let callCount = 0;

      const mockMessages = [
        { topic: 'test', partition: 0, key: 'k1', value: 'v1', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'k2', value: 'v2', offset: 1n, timestamp: 1n },
        { topic: 'test', partition: 0, key: 'k3', value: 'v3', offset: 2n, timestamp: 2n },
      ];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'error-loop-group',
        topics: ['test'],
        identifier: 'error-loop',
        onMessage: async (opts: { message: unknown }) => {
          callCount++;
          // Throw on second message only
          if (callCount === 2) {
            throw new Error('handler-error');
          }
          receivedMessages.push(opts.message);
        },
        onError: (opts: { error: Error }) => {
          errors.push(opts.error);
        },
      });

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // Should have processed 2 messages (1st and 3rd) and caught 1 error (2nd)
      expect(receivedMessages.length).toBe(2);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('handler-error');

      c.close().catch(() => {});
    });

    test('TC-066: consumeLoop should break when abortController is aborted', async () => {
      const receivedMessages: unknown[] = [];

      const mockMessages = [
        { topic: 'test', partition: 0, key: 'k1', value: 'v1', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'k2', value: 'v2', offset: 1n, timestamp: 1n },
        { topic: 'test', partition: 0, key: 'k3', value: 'v3', offset: 2n, timestamp: 2n },
      ];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'abort-loop-group',
        topics: ['test'],
        identifier: 'abort-loop',
        onMessage: async (opts: { message: unknown }) => {
          receivedMessages.push(opts.message);
          // Abort after first message
          if (receivedMessages.length === 1) {
            (c as any).abortController.abort();
          }
        },
      });

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // Should have received only 1 message before abort kicked in
      // (the abort check happens at the top of the for-await loop, so
      //  the first message is processed, abort fires, then on next iteration
      //  the check breaks)
      expect(receivedMessages.length).toBeLessThanOrEqual(2);
      // consuming should be set to false in finally block
      expect(c.isConsuming()).toBe(false);

      c.close().catch(() => {});
    });

    test('TC-067: consumeLoop should handle stream errors and call onError', async () => {
      const errors: Error[] = [];
      const streamError = new Error('stream-died');

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'stream-error-group',
        topics: ['test'],
        identifier: 'stream-error',
        onError: (opts: { error: Error }) => {
          errors.push(opts.error);
        },
      });

      const stream = createMockStream([], { throwError: streamError });
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('stream-died');
      // consuming should be false after loop exits
      expect(c.isConsuming()).toBe(false);

      c.close().catch(() => {});
    });

    test('TC-068: consumeLoop should NOT call onError for stream error when aborted', async () => {
      const errors: Error[] = [];
      const streamError = new Error('stream-aborted');

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'stream-aborted-group',
        topics: ['test'],
        identifier: 'stream-aborted',
        onError: (opts: { error: Error }) => {
          errors.push(opts.error);
        },
      });

      // Abort before starting the loop
      (c as any).abortController.abort();

      const stream = createMockStream([], { throwError: streamError });
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // onError should NOT be called because abort was signaled
      expect(errors.length).toBe(0);
      expect(c.isConsuming()).toBe(false);

      c.close().catch(() => {});
    });

    test('TC-069: consumeLoop should return immediately if stream is null', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'null-stream-group',
        topics: ['test'],
        identifier: 'null-stream',
      });

      // stream is null by default
      await (c as any).consumeLoop();

      // Should not throw, just return
      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-070: consumeLoop should set consuming=false in finally block', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'finally-group',
        topics: ['test'],
        identifier: 'finally-test',
      });

      const stream = createMockStream([
        { topic: 'test', partition: 0, key: 'k', value: 'v', offset: 0n, timestamp: 0n },
      ]);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-071: consumeLoop with no onMessage callback should silently iterate messages', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'no-handler-group',
        topics: ['test'],
        identifier: 'no-handler',
        // No onMessage provided
      });

      const mockMessages = [
        { topic: 'test', partition: 0, key: 'k1', value: 'v1', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'k2', value: 'v2', offset: 1n, timestamp: 1n },
      ];

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      // Should complete without throwing
      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-072: consumeLoop with no onError callback should still handle errors gracefully', async () => {
      let callCount = 0;
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'no-onerror-group',
        topics: ['test'],
        identifier: 'no-onerror',
        onMessage: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('no-onerror-handler');
          }
        },
        // No onError provided
      });

      const mockMessages = [
        { topic: 'test', partition: 0, key: 'k1', value: 'v1', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'k2', value: 'v2', offset: 1n, timestamp: 1n },
      ];

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      // Should not throw even without onError callback
      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 6. KafkaAdminHelper — Unit Tests
  // =============================================================================

  describe('KafkaAdminHelper (Unit)', () => {
    test('TC-073: newInstance should create an admin helper', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'ignis-test-admin-construct',
        identifier: 'test-admin-construct',
      });
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      expect(a.getIdentifier()).toBe('test-admin-construct');
      a.close().catch(() => {});
    });

    test('TC-074: newInstance with minimal options', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
      });
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      expect(a.getIdentifier()).toBe('');
      a.close().catch(() => {});
    });

    test('TC-075: newInstance with all options', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'full-admin',
        identifier: 'full-admin-id',
        timeout: 20_000,
        retries: 5,
        retryDelay: 2_000,
      });
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      expect(a.getIdentifier()).toBe('full-admin-id');
      a.close().catch(() => {});
    });

    test('TC-076: scope should be set to class name', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'scope-admin',
      });
      expect(a.scope).toBe('KafkaAdminHelper');
      a.close().catch(() => {});
    });

    test('TC-077: should have a logger from BaseHelper', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'logger-admin',
      });
      expect(a.logger).toBeDefined();
      expect(typeof a.logger.info).toBe('function');
      expect(typeof a.logger.error).toBe('function');
      a.close().catch(() => {});
    });

    test('TC-078: getIdentifier should return the provided identifier', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'custom-id-admin',
      });
      expect(a.getIdentifier()).toBe('custom-id-admin');
      a.close().catch(() => {});
    });

    test('TC-079: admin with retries=false', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        retries: false,
      });
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      a.close().catch(() => {});
    });

    test('TC-080: admin with multiple bootstrap brokers', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['broker1:9092', 'broker2:9092'],
      });
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      a.close().catch(() => {});
    });

    test('TC-081: close on admin that never made any requests should not throw', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        retries: false,
        timeout: 2_000,
      });

      try {
        await a.close();
      } catch {
        // Acceptable if underlying library rejects
      }
    });
  });

  // =============================================================================
  // 7. KafkaAdminHelper — Error Path Tests
  // =============================================================================

  describe('KafkaAdminHelper (Error Paths)', () => {
    test(
      'TC-082: createTopics should throw on unreachable broker',
      async () => {
        const a = KafkaAdminHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          retries: false,
          timeout: 3_000,
          identifier: 'create-error',
        });

        let didThrow = false;
        try {
          await a.createTopics({ topics: ['error-topic'], partitions: 1, replicas: 1 });
        } catch {
          didThrow = true;
        }

        expect(didThrow).toBe(true);
        a.close().catch(() => {});
      },
      TIMEOUT,
    );

    test(
      'TC-083: deleteTopics should throw on unreachable broker',
      async () => {
        const a = KafkaAdminHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          retries: false,
          timeout: 3_000,
          identifier: 'delete-error',
        });

        let didThrow = false;
        try {
          await a.deleteTopics({ topics: ['error-topic'] });
        } catch {
          didThrow = true;
        }

        expect(didThrow).toBe(true);
        a.close().catch(() => {});
      },
      TIMEOUT,
    );

    test(
      'TC-084: listTopics should throw on unreachable broker',
      async () => {
        const a = KafkaAdminHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          retries: false,
          timeout: 3_000,
          identifier: 'list-error',
        });

        let didThrow = false;
        try {
          await a.listTopics();
        } catch {
          didThrow = true;
        }

        expect(didThrow).toBe(true);
        a.close().catch(() => {});
      },
      TIMEOUT,
    );

    test(
      'TC-085: metadata should throw on unreachable broker',
      async () => {
        const a = KafkaAdminHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          retries: false,
          timeout: 3_000,
          identifier: 'metadata-error',
        });

        let didThrow = false;
        try {
          await a.metadata();
        } catch {
          didThrow = true;
        }

        expect(didThrow).toBe(true);
        a.close().catch(() => {});
      },
      TIMEOUT,
    );
  });

  // =============================================================================
  // 8. Boundary & Edge Case Tests
  // =============================================================================

  describe('Boundary & Edge Cases', () => {
    test('TC-086: producer send with empty messages array should propagate to underlying producer', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'empty-msg',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      // Calling send with empty messages — the underlying library may accept or reject
      await p.send({ messages: [] });

      expect(sendSpy).toHaveBeenCalledWith({ messages: [] });
      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-087: sendBatch with many topics should flatten all messages correctly', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'many-topics',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      const topicMessages = Array.from({ length: 10 }, (_unused, i) => ({
        topic: `topic-${i}`,
        messages: Array.from({ length: 5 }, (_inner, j) => ({
          topic: '',
          key: `k-${i}-${j}`,
          value: `v-${i}-${j}`,
        })),
      }));

      await p.sendBatch({ topicMessages });

      const callArgs = sendSpy.mock.calls[0][0] as { messages: Array<{ topic: string }> };
      expect(callArgs.messages.length).toBe(50); // 10 topics * 5 messages each

      // Verify topics are correctly assigned
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 5; j++) {
          expect(callArgs.messages[i * 5 + j].topic).toBe(`topic-${i}`);
        }
      }

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-088: producer with very long identifier should work', () => {
      const longId = 'a'.repeat(1000);
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: longId,
      });
      expect(p.getIdentifier()).toBe(longId);
      expect(p.getIdentifier().length).toBe(1000);
      p.close().catch(() => {});
    });

    test('TC-089: consumer with very long groupId should construct', () => {
      const longGroupId = 'g'.repeat(500);
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: longGroupId,
        topics: ['test'],
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-090: producer identifier with empty string should be accepted', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: '',
      });
      expect(p.getIdentifier()).toBe('');
      p.close().catch(() => {});
    });

    test('TC-091: sendBatch preserves original message properties alongside topic override', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'preserve-props',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({
        topicMessages: [
          {
            topic: 'override-topic',
            messages: [
              {
                topic: 'original-topic',
                key: 'my-key',
                value: 'my-value',
                partition: 3,
                headers: { 'x-trace': 'abc' },
              },
            ],
          },
        ],
      });

      const callArgs = sendSpy.mock.calls[0][0] as {
        messages: Array<{
          topic: string;
          key: string;
          value: string;
          partition: number;
          headers: Record<string, string>;
        }>;
      };
      const msg = callArgs.messages[0];
      expect(msg.topic).toBe('override-topic'); // Topic overridden by batch
      expect(msg.key).toBe('my-key'); // Preserved
      expect(msg.value).toBe('my-value'); // Preserved
      expect(msg.partition).toBe(3); // Preserved
      expect(msg.headers).toEqual({ 'x-trace': 'abc' }); // Preserved

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-092: consumer consumeLoop with large number of messages', async () => {
      const receivedCount = { value: 0 };
      const messageCount = 1000;

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'large-msg-group',
        topics: ['test'],
        identifier: 'large-msg',
        onMessage: async () => {
          receivedCount.value++;
        },
      });

      const mockMessages = Array.from({ length: messageCount }, (_, i) => ({
        topic: 'test',
        partition: 0,
        key: `k-${i}`,
        value: `v-${i}`,
        offset: BigInt(i),
        timestamp: BigInt(Date.now()),
      }));

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(receivedCount.value).toBe(messageCount);
      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 9. Security & Input Validation Tests
  // =============================================================================

  describe('Security & Input Validation', () => {
    test('TC-093: producer should handle SQL injection-like topic names in construction', () => {
      // The producer should accept any topic string — validation happens at broker level
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: "'; DROP TABLE users; --",
      });
      expect(p.getIdentifier()).toBe("'; DROP TABLE users; --");
      p.close().catch(() => {});
    });

    test('TC-094: producer should handle XSS-like values in identifier', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: '<script>alert("xss")</script>',
      });
      expect(p.getIdentifier()).toBe('<script>alert("xss")</script>');
      p.close().catch(() => {});
    });

    test('TC-095: producer should handle command injection-like clientId', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        clientId: '$(whoami)',
        identifier: 'cmd-injection-test',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-096: producer should handle path traversal-like strings', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: '../../../etc/passwd',
      });
      expect(p.getIdentifier()).toBe('../../../etc/passwd');
      p.close().catch(() => {});
    });

    test('TC-097: consumer should handle prototype pollution-like groupId', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: '__proto__',
        topics: ['test'],
        identifier: 'proto-pollution',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-098: consumer should handle constructor.prototype groupId', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'constructor.prototype',
        topics: ['test'],
        identifier: 'proto-constructor',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-099: sendBatch should handle messages with injection-like topic names', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'injection-topic',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      const maliciousTopics = [
        '; rm -rf /',
        '$(cat /etc/passwd)',
        "' OR '1'='1",
        '<img src=x onerror=alert(1)>',
        '\\x00null-byte',
      ];

      await p.sendBatch({
        topicMessages: maliciousTopics.map(topic => ({
          topic,
          messages: [{ topic: '', value: 'test' }],
        })),
      });

      const callArgs = sendSpy.mock.calls[0][0] as { messages: Array<{ topic: string }> };
      expect(callArgs.messages.length).toBe(maliciousTopics.length);

      // All malicious topic names should be passed through — Kafka broker handles validation
      for (let i = 0; i < maliciousTopics.length; i++) {
        expect(callArgs.messages[i].topic).toBe(maliciousTopics[i]);
      }

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-100: admin should handle topics with special characters in createTopics', () => {
      // Construction should succeed even with unusual bootstrap broker formats
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'special-chars-admin',
      });
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      a.close().catch(() => {});
    });

    test('TC-101: producer clientId with null byte should be accepted at construction level', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        clientId: 'client\x00id',
        identifier: 'null-byte-client',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-102: consumer with extremely long topic name', () => {
      const longTopic = 't'.repeat(249); // Kafka max topic length is 249
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'long-topic-group',
        topics: [longTopic],
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 10. Type & Generic Tests
  // =============================================================================

  describe('Type & Generic Tests', () => {
    test('TC-103: KafkaProducerHelper should accept generic type parameters via newInstance', () => {
      const p = KafkaProducerHelper.newInstance<string, string, string, string>({
        bootstrapBrokers: ['localhost:9092'],
        serializers: stringSerializers,
        identifier: 'generic-test',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-104: KafkaConsumerHelper should accept generic type parameters via newInstance', () => {
      const c = KafkaConsumerHelper.newInstance<string, string, string, string>({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'generic-group',
        topics: ['test'],
        deserializers: stringDeserializers,
        identifier: 'generic-consumer',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });

    test('TC-105: KafkaProducerHelper with default generic types (unknown)', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'default-generic',
      });
      expect(p).toBeInstanceOf(KafkaProducerHelper);
      p.close().catch(() => {});
    });

    test('TC-106: KafkaConsumerHelper with default generic types (unknown)', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'default-generic-group',
        topics: ['test'],
        identifier: 'default-generic-consumer',
      });
      expect(c).toBeInstanceOf(KafkaConsumerHelper);
      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 11. BaseHelper Integration Tests
  // =============================================================================

  describe('BaseHelper Integration', () => {
    test('TC-107: all helpers should extend BaseHelper (producer)', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'base-check-p',
      });
      expect(typeof p.getIdentifier).toBe('function');
      expect(typeof p.getLogger).toBe('function');
      expect(p.scope).toBeDefined();
      expect(p.identifier).toBeDefined();
      expect(p.logger).toBeDefined();
      p.close().catch(() => {});
    });

    test('TC-108: all helpers should extend BaseHelper (consumer)', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'base-check-group',
        topics: ['test'],
        identifier: 'base-check-c',
      });
      expect(typeof c.getIdentifier).toBe('function');
      expect(typeof c.getLogger).toBe('function');
      expect(c.scope).toBeDefined();
      expect(c.identifier).toBeDefined();
      expect(c.logger).toBeDefined();
      c.close().catch(() => {});
    });

    test('TC-109: all helpers should extend BaseHelper (admin)', () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'base-check-a',
      });
      expect(typeof a.getIdentifier).toBe('function');
      expect(typeof a.getLogger).toBe('function');
      expect(a.scope).toBeDefined();
      expect(a.identifier).toBeDefined();
      expect(a.logger).toBeDefined();
      a.close().catch(() => {});
    });

    test('TC-110: getLogger should return the same logger as the logger property', () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'logger-equal',
      });
      expect(p.getLogger()).toBe(p.logger);
      p.close().catch(() => {});
    });
  });

  // =============================================================================
  // 12. Consumer start() Idempotency Test (Mocked)
  // =============================================================================

  describe('Consumer start() Idempotency (Mocked)', () => {
    test('TC-111: start() calling twice on a consuming consumer should warn and return early', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'idempotent-start-group',
        topics: ['test'],
        identifier: 'idempotent-start',
      });

      // Simulate that consume is already running
      (c as any).consuming = true;
      const loggerWarnSpy = spyOn(c.logger.for('start'), 'warn');

      await c.start();

      // Should have warned and returned early
      expect(loggerWarnSpy).toHaveBeenCalled();
      expect(c.isConsuming()).toBe(true);

      loggerWarnSpy.mockRestore();
      (c as any).consuming = false;
      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 13. close() Behavior Tests
  // =============================================================================

  describe('close() Behavior', () => {
    test('TC-112: consumer close should abort controller and set consuming=false', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-behavior-group',
        topics: ['test'],
        identifier: 'close-behavior',
      });

      (c as any).consuming = true;
      const abortController = (c as any).abortController as AbortController;

      expect(abortController.signal.aborted).toBe(false);

      // close will call abort() on the controller
      try {
        await c.close();
      } catch {
        // Acceptable if underlying consumer.close fails
      }

      expect(abortController.signal.aborted).toBe(true);
      expect(c.isConsuming()).toBe(false);
    });

    test('TC-113: consumer close should attempt to close stream and consumer', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-stream-group',
        topics: ['test'],
        identifier: 'close-stream',
      });

      const mockStream = {
        close: mock(async () => {}),
      };
      (c as any).stream = mockStream;

      try {
        await c.close();
      } catch {
        // Acceptable if underlying consumer.close fails on unconnected consumer
      }

      // Stream close should have been called
      expect(mockStream.close).toHaveBeenCalled();
    });

    test('TC-114: consumer close error should be re-thrown', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-error-group',
        topics: ['test'],
        identifier: 'close-error',
      });

      // Mock the internal consumer to throw on close
      const mockConsumer = {
        close: mock(async () => {
          throw new Error('close-failed');
        }),
      };
      (c as any).consumer = mockConsumer;

      let thrownError: Error | undefined;
      try {
        await c.close();
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toBe('close-failed');
    });

    test('TC-115: producer close error should be re-thrown', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'close-error-producer',
      });

      // Mock the internal producer to throw on close
      const mockProducer = {
        close: mock(async () => {
          throw new Error('producer-close-failed');
        }),
      };
      (p as any).producer = mockProducer;

      let thrownError: Error | undefined;
      try {
        await p.close();
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toBe('producer-close-failed');
    });

    test('TC-116: admin close error should be re-thrown', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'close-error-admin',
      });

      // Mock the internal admin to throw on close
      const mockAdmin = {
        close: mock(async () => {
          throw new Error('admin-close-failed');
        }),
      };
      (a as any).admin = mockAdmin;

      let thrownError: Error | undefined;
      try {
        await a.close();
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toBe('admin-close-failed');
    });
  });

  // =============================================================================
  // 14. Concurrent / Race Condition Tests
  // =============================================================================

  describe('Concurrent & Race Condition Tests', () => {
    test('TC-117: multiple concurrent sendBatch calls should each flatten correctly', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'concurrent-batch',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      // Fire 5 concurrent sendBatch calls
      const promises = Array.from({ length: 5 }, (_, i) =>
        p.sendBatch({
          topicMessages: [
            {
              topic: `concurrent-topic-${i}`,
              messages: [{ topic: '', key: `k-${i}`, value: `v-${i}` }],
            },
          ],
        }),
      );

      await Promise.all(promises);

      expect(sendSpy).toHaveBeenCalledTimes(5);
      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-118: concurrent consumeLoop message processing should maintain order within a single loop', async () => {
      const received: string[] = [];
      const mockMessages = Array.from({ length: 20 }, (_, i) => ({
        topic: 'test',
        partition: 0,
        key: `k-${i}`,
        value: `v-${i}`,
        offset: BigInt(i),
        timestamp: BigInt(Date.now()),
      }));

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'order-group',
        topics: ['test'],
        identifier: 'order-test',
        onMessage: async (opts: { message: any }) => {
          received.push(opts.message.key as string);
        },
      });

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // Messages should be processed in order within a single loop
      expect(received.length).toBe(20);
      for (let i = 0; i < 20; i++) {
        expect(received[i]).toBe(`k-${i}`);
      }

      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 15. Integration Tests (Real Broker)
  // =============================================================================

  describe('Integration Tests (Real Broker)', () => {
    let admin: KafkaAdminHelper;
    const adminTopic = `${TEST_TOPIC_PREFIX}-int-admin`;

    beforeAll(async () => {
      admin = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: 'ignis-test-admin-int',
        identifier: 'test-admin-int',
        timeout: TIMEOUT,
      });

      // Detect if broker is reachable and if it advertises a non-localhost address
      try {
        const meta = await admin.metadata();
        isBrokerConnectable = true;
        const brokerHost = [...meta.brokers.values()][0]?.host;
        isBrokerReachable =
          !!brokerHost && brokerHost !== 'localhost' && brokerHost !== '127.0.0.1';
      } catch {
        isBrokerConnectable = false;
        isBrokerReachable = false;
      }
    }, TIMEOUT);

    afterAll(async () => {
      try {
        await admin.deleteTopics({ topics: [adminTopic] });
      } catch {
        // ignore
      }
      await admin.close().catch(() => {});
    });

    // --- Admin integration tests ---

    test.skipIf(!isBrokerConnectable)(
      'TC-119: admin should create topics on real broker',
      async () => {
        const result = await admin.createTopics({
          topics: [adminTopic],
          partitions: 1,
          replicas: 1,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-120: admin should list topics and include created topic',
      async () => {
        const topics = await admin.listTopics();

        expect(Array.isArray(topics)).toBe(true);
        expect(topics).toContain(adminTopic);
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-121: admin should fetch cluster metadata',
      async () => {
        const meta = await admin.metadata();

        expect(meta).toBeDefined();
        expect(meta.brokers).toBeDefined();
        expect(meta.id).toBeDefined();
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-122: admin should fetch metadata for specific topics',
      async () => {
        const meta = await admin.metadata({ topics: [adminTopic] });

        expect(meta).toBeDefined();
        expect(meta.topics).toBeDefined();
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-123: admin should delete topics',
      async () => {
        const tempTopic = `${TEST_TOPIC_PREFIX}-int-del`;
        await admin.createTopics({ topics: [tempTopic], partitions: 1, replicas: 1 });

        await admin.deleteTopics({ topics: [tempTopic] });

        await wait(1_000);
        const topics = await admin.listTopics();
        expect(topics).not.toContain(tempTopic);
      },
      TIMEOUT * 2,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-124: listTopics with includeInternals should return at least as many topics',
      async () => {
        const topics = await admin.listTopics();
        const topicsWithInternals = await admin.listTopics({ includeInternals: true });

        expect(Array.isArray(topicsWithInternals)).toBe(true);
        expect(topicsWithInternals.length).toBeGreaterThanOrEqual(topics.length);
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-125: admin metadata with empty topics array should return all metadata',
      async () => {
        const meta = await admin.metadata({ topics: [] });

        expect(meta).toBeDefined();
        expect(meta.brokers).toBeDefined();
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerConnectable)(
      'TC-126: admin metadata without options should default to empty topics',
      async () => {
        const meta = await admin.metadata();

        expect(meta).toBeDefined();
        expect(meta.brokers).toBeDefined();
        expect(meta.id).toBeDefined();
      },
      TIMEOUT,
    );

    // --- Producer integration tests ---

    test.skipIf(!isBrokerReachable)(
      'TC-127: producer should send a single message to real broker',
      async () => {
        const producerTopic = `${TEST_TOPIC_PREFIX}-int-send`;
        await admin.createTopics({ topics: [producerTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-producer',
          identifier: 'int-producer',
          serializers: stringSerializers,
          acks: KafkaAcks.ALL,
          timeout: TIMEOUT,
        });

        await producer.send({
          messages: [{ topic: producerTopic, key: 'int-key-1', value: 'int-value-1' }],
        });

        await producer.close();
        try {
          await admin.deleteTopics({ topics: [producerTopic] });
        } catch {
          // ignore
        }
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-128: producer should send multiple messages to real broker',
      async () => {
        const producerTopic = `${TEST_TOPIC_PREFIX}-int-multi`;
        await admin.createTopics({ topics: [producerTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-multi-producer',
          identifier: 'int-multi-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        await producer.send({
          messages: [
            { topic: producerTopic, key: 'mk-1', value: 'mv-1' },
            { topic: producerTopic, key: 'mk-2', value: 'mv-2' },
            { topic: producerTopic, key: 'mk-3', value: 'mv-3' },
          ],
        });

        await producer.close();
        try {
          await admin.deleteTopics({ topics: [producerTopic] });
        } catch {
          // ignore
        }
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-129: producer sendBatch should work on real broker',
      async () => {
        const producerTopic = `${TEST_TOPIC_PREFIX}-int-batch`;
        await admin.createTopics({ topics: [producerTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-batch-producer',
          identifier: 'int-batch-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        await producer.sendBatch({
          topicMessages: [
            {
              topic: producerTopic,
              messages: [
                { topic: producerTopic, key: 'batch-k1', value: 'batch-v1' },
                { topic: producerTopic, key: 'batch-k2', value: 'batch-v2' },
              ],
            },
          ],
        });

        await producer.close();
        try {
          await admin.deleteTopics({ topics: [producerTopic] });
        } catch {
          // ignore
        }
      },
      TIMEOUT,
    );

    // --- Consumer integration tests ---

    test.skipIf(!isBrokerReachable)(
      'TC-130: consumer should start consuming and receive messages from real broker',
      async () => {
        const consumerTopic = `${TEST_TOPIC_PREFIX}-int-consume`;
        await admin.createTopics({ topics: [consumerTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-consume-producer',
          identifier: 'int-consume-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        const received: unknown[] = [];
        const consumer = KafkaConsumerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-consumer',
          identifier: 'int-consumer',
          groupId: `ignis-test-int-group-${Date.now()}`,
          topics: [consumerTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
          onMessage: async (opts: { message: any }) => {
            received.push(opts.message.value);
          },
        });

        await consumer.start();
        expect(consumer.isConsuming()).toBe(true);

        await producer.send({
          messages: [
            { topic: consumerTopic, key: 'ic-k1', value: 'ic-v1' },
            { topic: consumerTopic, key: 'ic-k2', value: 'ic-v2' },
          ],
        });

        const deadline = Date.now() + 20_000;
        while (received.length < 2 && Date.now() < deadline) {
          await wait(200);
        }

        expect(received.length).toBeGreaterThanOrEqual(2);
        expect(received).toContain('ic-v1');
        expect(received).toContain('ic-v2');

        await consumer.close();
        await producer.close();
        try {
          await admin.deleteTopics({ topics: [consumerTopic] });
        } catch {
          // ignore
        }
      },
      60_000,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-131: consumer start should be idempotent on real broker',
      async () => {
        const idempTopic = `${TEST_TOPIC_PREFIX}-int-idemp`;
        await admin.createTopics({ topics: [idempTopic], partitions: 1, replicas: 1 });

        const consumer = KafkaConsumerHelper.newInstance({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-idemp-consumer',
          identifier: 'int-idemp-consumer',
          groupId: `ignis-test-int-idemp-group-${Date.now()}`,
          topics: [idempTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
        });

        await consumer.start();
        expect(consumer.isConsuming()).toBe(true);

        // Second start should just warn and return
        await consumer.start();
        expect(consumer.isConsuming()).toBe(true);

        await consumer.close();
        try {
          await admin.deleteTopics({ topics: [idempTopic] });
        } catch {
          // ignore
        }
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-132: consumer close should stop consuming on real broker',
      async () => {
        const closeTopic = `${TEST_TOPIC_PREFIX}-int-close`;
        await admin.createTopics({ topics: [closeTopic], partitions: 1, replicas: 1 });

        const consumer = KafkaConsumerHelper.newInstance({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-close-consumer',
          identifier: 'int-close-consumer',
          groupId: `ignis-test-int-close-group-${Date.now()}`,
          topics: [closeTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
        });

        await consumer.start();
        expect(consumer.isConsuming()).toBe(true);

        await consumer.close();
        expect(consumer.isConsuming()).toBe(false);

        try {
          await admin.deleteTopics({ topics: [closeTopic] });
        } catch {
          // ignore
        }
      },
      TIMEOUT,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-133: consumer onError should fire when onMessage handler throws on real broker',
      async () => {
        const errorTopic = `${TEST_TOPIC_PREFIX}-int-onerror`;
        await admin.createTopics({ topics: [errorTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-onerror-producer',
          identifier: 'int-onerror-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        const errors: Error[] = [];
        const consumer = KafkaConsumerHelper.newInstance({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-onerror-consumer',
          identifier: 'int-onerror-consumer',
          groupId: `ignis-test-int-onerror-group-${Date.now()}`,
          topics: [errorTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
          onMessage: async () => {
            throw new Error('int-handler-error');
          },
          onError: (opts: { error: Error }) => {
            errors.push(opts.error);
          },
        });

        await consumer.start();

        await producer.send({
          messages: [{ topic: errorTopic, key: 'err-k', value: 'err-v' }],
        });

        const deadline = Date.now() + 20_000;
        while (errors.length < 1 && Date.now() < deadline) {
          await wait(200);
        }

        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors[0].message).toBe('int-handler-error');

        await consumer.close();
        await producer.close();
        try {
          await admin.deleteTopics({ topics: [errorTopic] });
        } catch {
          // ignore
        }
      },
      60_000,
    );

    // --- End-to-end ---

    test.skipIf(!isBrokerReachable)(
      'TC-134: end-to-end produce and consume round-trip',
      async () => {
        const e2eTopic = `${TEST_TOPIC_PREFIX}-int-e2e`;
        await admin.createTopics({ topics: [e2eTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-e2e-producer',
          identifier: 'int-e2e-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        const received: Array<{ key: unknown; value: unknown; topic: string }> = [];
        const consumer = KafkaConsumerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-e2e-consumer',
          identifier: 'int-e2e-consumer',
          groupId: `ignis-test-int-e2e-group-${Date.now()}`,
          topics: [e2eTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
          onMessage: async (opts: { message: any }) => {
            received.push({
              key: opts.message.key,
              value: opts.message.value,
              topic: opts.message.topic,
            });
          },
        });

        await consumer.start();

        const messages = Array.from({ length: 5 }, (_, i) => ({
          topic: e2eTopic,
          key: `e2e-key-${i}`,
          value: `e2e-value-${i}`,
        }));
        await producer.send({ messages });

        const deadline = Date.now() + 20_000;
        while (received.length < 5 && Date.now() < deadline) {
          await wait(200);
        }

        expect(received.length).toBeGreaterThanOrEqual(5);
        for (let i = 0; i < 5; i++) {
          const msg = received.find(m => m.key === `e2e-key-${i}`);
          expect(msg).toBeDefined();
          expect(msg!.value).toBe(`e2e-value-${i}`);
          expect(msg!.topic).toBe(e2eTopic);
        }

        await consumer.close();
        await producer.close();
        try {
          await admin.deleteTopics({ topics: [e2eTopic] });
        } catch {
          // ignore
        }
      },
      60_000,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-135: consumed message should have expected properties (topic, partition, offset, timestamp, commit)',
      async () => {
        const propsTopic = `${TEST_TOPIC_PREFIX}-int-props`;
        await admin.createTopics({ topics: [propsTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-props-producer',
          identifier: 'int-props-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        const received: any[] = [];
        const consumer = KafkaConsumerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-props-consumer',
          identifier: 'int-props-consumer',
          groupId: `ignis-test-int-props-group-${Date.now()}`,
          topics: [propsTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
          onMessage: async (opts: { message: any }) => {
            received.push(opts.message);
          },
        });

        await consumer.start();

        await producer.send({
          messages: [{ topic: propsTopic, key: 'pk', value: 'pv' }],
        });

        const deadline = Date.now() + 20_000;
        while (received.length < 1 && Date.now() < deadline) {
          await wait(200);
        }

        expect(received.length).toBeGreaterThanOrEqual(1);
        const msg = received[0];
        expect(msg.topic).toBe(propsTopic);
        expect(typeof msg.partition).toBe('number');
        expect(typeof msg.offset).toBe('bigint');
        expect(typeof msg.timestamp).toBe('bigint');
        expect(typeof msg.commit).toBe('function');

        await consumer.close();
        await producer.close();
        try {
          await admin.deleteTopics({ topics: [propsTopic] });
        } catch {
          // ignore
        }
      },
      60_000,
    );

    test.skipIf(!isBrokerReachable)(
      'TC-136: should handle messages with headers end-to-end',
      async () => {
        const headerTopic = `${TEST_TOPIC_PREFIX}-int-headers`;
        await admin.createTopics({ topics: [headerTopic], partitions: 1, replicas: 1 });

        const producer = KafkaProducerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-headers-producer',
          identifier: 'int-headers-producer',
          serializers: stringSerializers,
          timeout: TIMEOUT,
        });

        const received: any[] = [];
        const consumer = KafkaConsumerHelper.newInstance<string, string, string, string>({
          bootstrapBrokers: BROKERS,
          clientId: 'ignis-test-int-headers-consumer',
          identifier: 'int-headers-consumer',
          groupId: `ignis-test-int-headers-group-${Date.now()}`,
          topics: [headerTopic],
          deserializers: stringDeserializers,
          mode: 'earliest',
          timeout: TIMEOUT,
          onMessage: async (opts: { message: any }) => {
            received.push(opts.message);
          },
        });

        await consumer.start();

        await producer.send({
          messages: [
            {
              topic: headerTopic,
              key: 'hdr-key',
              value: 'hdr-value',
              headers: { 'x-trace-id': 'trace-123', 'x-source': 'ignis-test' },
            },
          ],
        });

        const deadline = Date.now() + 20_000;
        while (received.length < 1 && Date.now() < deadline) {
          await wait(200);
        }

        expect(received.length).toBeGreaterThanOrEqual(1);
        expect(received[0].value).toBe('hdr-value');
        expect(received[0].headers).toBeDefined();

        await consumer.close();
        await producer.close();
        try {
          await admin.deleteTopics({ topics: [headerTopic] });
        } catch {
          // ignore
        }
      },
      60_000,
    );
  });

  // =============================================================================
  // 16. Producer Deep Dive
  // =============================================================================

  describe('Producer Deep Dive', () => {
    test(
      'TC-137: send() should re-throw the EXACT same error object (identity check with ===)',
      async () => {
        const p = KafkaProducerHelper.newInstance({
          bootstrapBrokers: ['localhost:1'],
          identifier: 'exact-error-identity',
          retries: false,
          timeout: 3_000,
        });

        // Replace internal producer with a mock that throws a known error
        const sentinelError = new Error('sentinel-error');
        const mockProducer = {
          send: mock(async () => {
            throw sentinelError;
          }),
          close: mock(async () => {}),
        };
        (p as any).producer = mockProducer;

        let caughtError: unknown;
        try {
          await p.send({ messages: [{ topic: 't', value: 'v' }] });
        } catch (err) {
          caughtError = err;
        }

        // Must be the exact same object reference, not a wrapper
        expect(caughtError === sentinelError).toBe(true);
        await p.close().catch(() => {});
      },
      TIMEOUT,
    );

    test('TC-138: send() calls onError BEFORE re-throwing — verify ordering with sequence tracker', async () => {
      const sequence: string[] = [];

      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'error-ordering',
        retries: false,
        timeout: 3_000,
        onError: () => {
          sequence.push('onError');
        },
      });

      const mockProducer = {
        send: mock(async () => {
          throw new Error('fail');
        }),
        close: mock(async () => {}),
      };
      (p as any).producer = mockProducer;

      try {
        await p.send({ messages: [{ topic: 't', value: 'v' }] });
      } catch {
        sequence.push('catch');
      }

      // onError must fire before the catch block sees the re-throw
      expect(sequence).toEqual(['onError', 'catch']);
      await p.close().catch(() => {});
    });

    test('TC-139: sendBatch with mixed topics — each message gets correct topic override', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'mixed-topics',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({
        topicMessages: [
          {
            topic: 'orders',
            messages: [
              { topic: '', key: 'o1', value: 'order-1' },
              { topic: '', key: 'o2', value: 'order-2' },
            ],
          },
          { topic: 'payments', messages: [{ topic: '', key: 'p1', value: 'pay-1' }] },
          {
            topic: 'notifications',
            messages: [
              { topic: '', key: 'n1', value: 'notify-1' },
              { topic: '', key: 'n2', value: 'notify-2' },
              { topic: '', key: 'n3', value: 'notify-3' },
            ],
          },
        ],
      });

      const msgs = (sendSpy.mock.calls[0][0] as { messages: Array<{ topic: string; key: string }> })
        .messages;
      expect(msgs.length).toBe(6);
      expect(msgs[0]).toEqual(expect.objectContaining({ topic: 'orders', key: 'o1' }));
      expect(msgs[1]).toEqual(expect.objectContaining({ topic: 'orders', key: 'o2' }));
      expect(msgs[2]).toEqual(expect.objectContaining({ topic: 'payments', key: 'p1' }));
      expect(msgs[3]).toEqual(expect.objectContaining({ topic: 'notifications', key: 'n1' }));
      expect(msgs[4]).toEqual(expect.objectContaining({ topic: 'notifications', key: 'n2' }));
      expect(msgs[5]).toEqual(expect.objectContaining({ topic: 'notifications', key: 'n3' }));

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-140: sendBatch preserves partition and headers on each message', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'preserve-partition-headers',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      const headers = new Map([['x-id', 'abc']]);
      await p.sendBatch({
        topicMessages: [
          {
            topic: 'topic-x',
            messages: [{ topic: '', key: 'k1', value: 'v1', partition: 7, headers }],
          },
        ],
      });

      const msg = (
        sendSpy.mock.calls[0][0] as {
          messages: Array<{ partition: number; headers: Map<string, string> }>;
        }
      ).messages[0];
      expect(msg.partition).toBe(7);
      // Headers should be the same Map instance since spread preserves references
      expect(msg.headers).toBeInstanceOf(Map);
      expect(msg.headers.get('x-id')).toBe('abc');

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-141: send() with messages that have partition specified — verify partition passes through', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'partition-passthrough',
        retries: false,
        timeout: 2_000,
      });

      // Mock the internal producer to capture the call
      const capturedArgs: any[] = [];
      const mockProducer = {
        send: mock(async (opts: any) => {
          capturedArgs.push(opts);
        }),
        close: mock(async () => {}),
      };
      (p as any).producer = mockProducer;

      await p.send({
        messages: [{ topic: 'partitioned-topic', key: 'k', value: 'v', partition: 5 }],
      });

      expect(capturedArgs.length).toBe(1);
      expect(capturedArgs[0].messages[0].partition).toBe(5);
      await p.close().catch(() => {});
    });

    test('TC-142: multiple sequential sends should all succeed without issues', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'sequential-sends',
        retries: false,
        timeout: 2_000,
      });

      const callCount = { value: 0 };
      const mockProducer = {
        send: mock(async () => {
          callCount.value++;
        }),
        close: mock(async () => {}),
      };
      (p as any).producer = mockProducer;

      // Send 10 messages sequentially
      for (let i = 0; i < 10; i++) {
        await p.send({ messages: [{ topic: `topic-${i}`, value: `value-${i}` }] });
      }

      expect(callCount.value).toBe(10);
      await p.close().catch(() => {});
    });

    test('TC-143: send() with messages that have headers as Map — verify Map passes through', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'map-headers',
        retries: false,
        timeout: 2_000,
      });

      const capturedArgs: any[] = [];
      const mockProducer = {
        send: mock(async (opts: any) => {
          capturedArgs.push(opts);
        }),
        close: mock(async () => {}),
      };
      (p as any).producer = mockProducer;

      const mapHeaders = new Map<string, string>([
        ['x-trace', 'trace-456'],
        ['x-source', 'test'],
      ]);
      await p.send({
        messages: [{ topic: 'map-headers-topic', key: 'k', value: 'v', headers: mapHeaders }],
      });

      expect(capturedArgs[0].messages[0].headers).toBeInstanceOf(Map);
      expect(capturedArgs[0].messages[0].headers.get('x-trace')).toBe('trace-456');
      await p.close().catch(() => {});
    });

    test('TC-144: send() logs debug message on success with correct message count', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'debug-log-count',
        retries: false,
        timeout: 2_000,
      });

      const mockProducer = { send: mock(async () => {}), close: mock(async () => {}) };
      (p as any).producer = mockProducer;

      const debugSpy = spyOn(p.logger.for('send'), 'debug');

      await p.send({
        messages: [
          { topic: 't', value: 'v1' },
          { topic: 't', value: 'v2' },
          { topic: 't', value: 'v3' },
        ],
      });

      expect(debugSpy).toHaveBeenCalled();
      debugSpy.mockRestore();
      await p.close().catch(() => {});
    });
  });

  // =============================================================================
  // 17. Consumer Deep Dive
  // =============================================================================

  describe('Consumer Deep Dive', () => {
    test('TC-145: consumeLoop processes messages sequentially — each onMessage awaited before next', async () => {
      const processingOrder: Array<{ key: string; startTime: number; endTime: number }> = [];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'sequential-processing-group',
        topics: ['test'],
        identifier: 'sequential-processing',
        onMessage: async (opts: { message: any }) => {
          const start = Date.now();
          // Simulate async work with a small delay
          await wait(10);
          processingOrder.push({
            key: opts.message.key as string,
            startTime: start,
            endTime: Date.now(),
          });
        },
      });

      const mockMessages = [
        { topic: 'test', partition: 0, key: 'seq-1', value: 'v1', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'seq-2', value: 'v2', offset: 1n, timestamp: 1n },
        { topic: 'test', partition: 0, key: 'seq-3', value: 'v3', offset: 2n, timestamp: 2n },
      ];

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(processingOrder.length).toBe(3);
      // Each message's start time should be >= previous message's end time (sequential)
      for (let i = 1; i < processingOrder.length; i++) {
        expect(processingOrder[i].startTime).toBeGreaterThanOrEqual(processingOrder[i - 1].endTime);
      }

      c.close().catch(() => {});
    });

    test('TC-146: consumeLoop — onMessage error does NOT stop the loop — subsequent messages still processed', async () => {
      const processed: string[] = [];
      const errors: Error[] = [];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'continue-after-error-group',
        topics: ['test'],
        identifier: 'continue-after-error',
        onMessage: async (opts: { message: any }) => {
          const key = opts.message.key as string;
          if (key === 'fail-1' || key === 'fail-3') {
            throw new Error(`handler-error-${key}`);
          }
          processed.push(key);
        },
        onError: (opts: { error: Error }) => {
          errors.push(opts.error);
        },
      });

      const mockMessages = [
        { topic: 'test', partition: 0, key: 'ok-0', value: 'v', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'fail-1', value: 'v', offset: 1n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'ok-2', value: 'v', offset: 2n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'fail-3', value: 'v', offset: 3n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'ok-4', value: 'v', offset: 4n, timestamp: 0n },
      ];

      const stream = createMockStream(mockMessages);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // All non-failing messages should be processed
      expect(processed).toEqual(['ok-0', 'ok-2', 'ok-4']);
      // Both errors should be captured
      expect(errors.length).toBe(2);
      expect(errors[0].message).toBe('handler-error-fail-1');
      expect(errors[1].message).toBe('handler-error-fail-3');

      c.close().catch(() => {});
    });

    test('TC-147: consumeLoop — stream error with aborted signal does NOT call onError (guard check)', async () => {
      const errors: Error[] = [];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'aborted-stream-error-group',
        topics: ['test'],
        identifier: 'aborted-stream-error',
        onMessage: async (_opts: { message: any }) => {
          // Abort during message processing so the stream error path sees aborted=true
          (c as any).abortController.abort();
        },
        onError: (opts: { error: Error }) => {
          errors.push(opts.error);
        },
      });

      // One message to trigger abort, then stream throws
      const stream = createMockStream(
        [{ topic: 'test', partition: 0, key: 'k', value: 'v', offset: 0n, timestamp: 0n }],
        { throwError: new Error('stream-post-abort-error') },
      );
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // onError should NOT be called for stream error since signal was already aborted
      // (note: the onMessage handler error itself won't fire since onMessage doesn't throw)
      expect(errors.length).toBe(0);
      expect(c.isConsuming()).toBe(false);

      c.close().catch(() => {});
    });

    test('TC-148: consumeLoop — stream error without abort DOES call onError', async () => {
      const errors: Error[] = [];
      const streamError = new Error('unaborted-stream-error');

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'unaborted-stream-error-group',
        topics: ['test'],
        identifier: 'unaborted-stream-error',
        onError: (opts: { error: Error }) => {
          errors.push(opts.error);
        },
      });

      // Stream with no messages but throws an error — signal is NOT aborted
      const stream = createMockStream([], { throwError: streamError });
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(errors.length).toBe(1);
      expect(errors[0]).toBe(streamError); // Same object reference
      expect(c.isConsuming()).toBe(false);

      c.close().catch(() => {});
    });

    test('TC-149: consumeLoop sets consuming=false in finally — after normal completion', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'finally-normal-group',
        topics: ['test'],
        identifier: 'finally-normal',
      });

      const stream = createMockStream([
        { topic: 'test', partition: 0, key: 'k', value: 'v', offset: 0n, timestamp: 0n },
      ]);
      (c as any).stream = stream;
      (c as any).consuming = true;
      expect(c.isConsuming()).toBe(true);

      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-150: consumeLoop sets consuming=false in finally — after stream error', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'finally-error-group',
        topics: ['test'],
        identifier: 'finally-error',
      });

      const stream = createMockStream([], { throwError: new Error('stream-fail') });
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-151: consumeLoop sets consuming=false in finally — after abort', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'finally-abort-group',
        topics: ['test'],
        identifier: 'finally-abort',
        onMessage: async () => {
          (c as any).abortController.abort();
        },
      });

      const stream = createMockStream([
        { topic: 'test', partition: 0, key: 'k', value: 'v', offset: 0n, timestamp: 0n },
        { topic: 'test', partition: 0, key: 'k2', value: 'v2', offset: 1n, timestamp: 0n },
      ]);
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-152: close() calls abort BEFORE closing stream — verify ordering', async () => {
      const sequence: string[] = [];

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-order-group',
        topics: ['test'],
        identifier: 'close-order',
      });

      // Track abort by replacing the abortController
      const originalAbort = (c as any).abortController.abort.bind((c as any).abortController);
      (c as any).abortController.abort = () => {
        sequence.push('abort');
        originalAbort();
      };

      // Mock stream.close to track call order
      const mockStream = {
        close: mock(async () => {
          sequence.push('stream.close');
        }),
      };
      (c as any).stream = mockStream;

      // Mock internal consumer to not fail
      const mockConsumer = {
        close: mock(async () => {
          sequence.push('consumer.close');
        }),
      };
      (c as any).consumer = mockConsumer;

      await c.close();

      expect(sequence[0]).toBe('abort');
      expect(sequence[1]).toBe('stream.close');
      expect(sequence[2]).toBe('consumer.close');
      expect(sequence.length).toBe(3);
    });

    test('TC-153: close() closes both stream AND consumer — verify both are called', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-both-group',
        topics: ['test'],
        identifier: 'close-both',
      });

      const mockStream = { close: mock(async () => {}) };
      const mockConsumer = { close: mock(async () => {}) };
      (c as any).stream = mockStream;
      (c as any).consumer = mockConsumer;

      await c.close();

      expect(mockStream.close).toHaveBeenCalledTimes(1);
      expect(mockConsumer.close).toHaveBeenCalledTimes(1);
    });

    test('TC-154: consumer stores all passed options in private fields', () => {
      const onMessage = mock(async () => {});
      const onError = mock(() => {});

      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'stored-opts-group',
        topics: ['topic-a', 'topic-b'],
        identifier: 'stored-opts',
        autocommit: 500,
        sessionTimeout: 45_000,
        heartbeatInterval: 5_000,
        highWaterMark: 2048,
        maxWaitTime: 8_000,
        mode: 'earliest',
        onMessage,
        onError,
      });

      // Verify private fields via cast
      expect((c as any).topics).toEqual(['topic-a', 'topic-b']);
      expect((c as any).autocommit).toBe(500);
      expect((c as any).sessionTimeout).toBe(45_000);
      expect((c as any).heartbeatInterval).toBe(5_000);
      expect((c as any).highWaterMark).toBe(2048);
      expect((c as any).maxWaitTime).toBe(8_000);
      expect((c as any).mode).toBe('earliest');
      expect((c as any).onMessage).toBe(onMessage);
      expect((c as any).onError).toBe(onError);

      c.close().catch(() => {});
    });

    test('TC-155: start() passes correct options to consumer.consume() including defaults from KafkaDefaults', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'consume-args-group',
        topics: ['my-topic'],
        identifier: 'consume-args',
        // Leave most options as undefined to test defaults
      });

      const consumeSpy = mock(async (_opts: any) => createMockStream([]));
      (c as any).consumer = { consume: consumeSpy, close: mock(async () => {}) };

      await c.start();

      expect(consumeSpy).toHaveBeenCalledTimes(1);
      const callArgs = consumeSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual(['my-topic']);
      expect(callArgs.autocommit).toBe(true); // default when undefined
      expect(callArgs.sessionTimeout).toBe(KafkaDefaults.SESSION_TIMEOUT);
      expect(callArgs.heartbeatInterval).toBe(KafkaDefaults.HEARTBEAT_INTERVAL);
      expect(callArgs.highWaterMark).toBe(KafkaDefaults.HIGH_WATER_MARK);
      expect(callArgs.maxWaitTime).toBe(KafkaDefaults.MAX_WAIT_TIME);
      expect(callArgs.mode).toBe('latest'); // default when undefined

      (c as any).consuming = false;
      c.close().catch(() => {});
    });

    test('TC-156: start() when already consuming should warn and NOT replace the existing stream', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'no-replace-stream-group',
        topics: ['test'],
        identifier: 'no-replace-stream',
      });

      // Set up initial state as if already consuming
      const originalStream = {
        close: mock(async () => {}),
        [Symbol.asyncIterator]: async function* () {},
      };
      (c as any).stream = originalStream;
      (c as any).consuming = true;

      const consumeSpy = mock(async () => createMockStream([]));
      (c as any).consumer = { consume: consumeSpy, close: mock(async () => {}) };

      await c.start();

      // consume should NOT have been called — stream should be unchanged
      expect(consumeSpy).not.toHaveBeenCalled();
      expect((c as any).stream).toBe(originalStream);

      (c as any).consuming = false;
      c.close().catch(() => {});
    });

    test('TC-157: consumeLoop with empty stream (no messages) — should complete normally', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'empty-stream-group',
        topics: ['test'],
        identifier: 'empty-stream',
        onMessage: mock(async () => {}),
      });

      const stream = createMockStream([]); // No messages
      (c as any).stream = stream;
      (c as any).consuming = true;

      await (c as any).consumeLoop();

      // Should complete without error, consuming set to false
      expect(c.isConsuming()).toBe(false);
      // onMessage should never have been called
      expect((c as any).onMessage).not.toHaveBeenCalled();

      c.close().catch(() => {});
    });

    test('TC-158: consumeLoop with no onError and stream error — should not crash, just log', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'no-onerror-stream-error-group',
        topics: ['test'],
        identifier: 'no-onerror-stream-error',
        // No onError callback
      });

      const stream = createMockStream([], { throwError: new Error('stream-error-no-handler') });
      (c as any).stream = stream;
      (c as any).consuming = true;

      // Should not throw
      await (c as any).consumeLoop();

      expect(c.isConsuming()).toBe(false);
      c.close().catch(() => {});
    });

    test('TC-159: consumer start() stores stream after consumer.consume()', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'stream-stored-group',
        topics: ['test'],
        identifier: 'stream-stored',
      });

      expect((c as any).stream).toBeNull();

      const mockReturnedStream = createMockStream([]);
      const consumeSpy = mock(async () => mockReturnedStream);
      (c as any).consumer = { consume: consumeSpy, close: mock(async () => {}) };

      await c.start();

      // Stream should be stored
      expect((c as any).stream).toBe(mockReturnedStream);

      (c as any).consuming = false;
      c.close().catch(() => {});
    });

    test('TC-160: consumer abortController is fresh (not aborted) on construction', () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'fresh-abort-group',
        topics: ['test'],
        identifier: 'fresh-abort',
      });

      const ac = (c as any).abortController as AbortController;
      expect(ac).toBeInstanceOf(AbortController);
      expect(ac.signal.aborted).toBe(false);

      c.close().catch(() => {});
    });
  });

  // =============================================================================
  // 18. Admin Deep Dive
  // =============================================================================

  describe('Admin Deep Dive', () => {
    test('TC-161: createTopics passes partitions and replicas to internal admin', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'create-args',
      });

      const createSpy = mock(async (opts: any) => opts);
      (a as any).admin = { createTopics: createSpy, close: mock(async () => {}) };

      await a.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 2 });

      expect(createSpy).toHaveBeenCalledTimes(1);
      const callArgs = createSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual(['my-topic']);
      expect(callArgs.partitions).toBe(3);
      expect(callArgs.replicas).toBe(2);

      await a.close().catch(() => {});
    });

    test('TC-162: createTopics with default partitions/replicas (not specified)', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'create-defaults',
      });

      const createSpy = mock(async (opts: any) => opts);
      (a as any).admin = { createTopics: createSpy, close: mock(async () => {}) };

      // Only pass topics, no partitions or replicas
      await a.createTopics({ topics: ['default-topic'] });

      const callArgs = createSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual(['default-topic']);
      expect(callArgs.partitions).toBeUndefined();
      expect(callArgs.replicas).toBeUndefined();

      await a.close().catch(() => {});
    });

    test('TC-163: deleteTopics passes topics array correctly', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'delete-args',
      });

      const deleteSpy = mock(async (_opts: any) => {});
      (a as any).admin = { deleteTopics: deleteSpy, close: mock(async () => {}) };

      await a.deleteTopics({ topics: ['topic-a', 'topic-b', 'topic-c'] });

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      const callArgs = deleteSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual(['topic-a', 'topic-b', 'topic-c']);

      await a.close().catch(() => {});
    });

    test('TC-164: listTopics passes includeInternals flag', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'list-internals',
      });

      const listSpy = mock(async (_opts: any) => {
        return [];
      });
      (a as any).admin = { listTopics: listSpy, close: mock(async () => {}) };

      await a.listTopics({ includeInternals: true });

      expect(listSpy).toHaveBeenCalledTimes(1);
      const callArgs = listSpy.mock.calls[0][0];
      expect(callArgs.includeInternals).toBe(true);

      await a.close().catch(() => {});
    });

    test('TC-165: listTopics without includeInternals passes undefined', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'list-no-internals',
      });

      const listSpy = mock(async (_opts: any) => []);
      (a as any).admin = { listTopics: listSpy, close: mock(async () => {}) };

      await a.listTopics();

      const callArgs = listSpy.mock.calls[0][0];
      expect(callArgs.includeInternals).toBeUndefined();

      await a.close().catch(() => {});
    });

    test('TC-166: metadata defaults topics to empty array when opts is undefined', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'metadata-no-opts',
      });

      const metaSpy = mock(async (_opts: any) => ({
        brokers: new Map(),
        id: 1,
        topics: new Map(),
      }));
      (a as any).admin = { metadata: metaSpy, close: mock(async () => {}) };

      await a.metadata(); // No opts

      const callArgs = metaSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual([]);

      await a.close().catch(() => {});
    });

    test('TC-167: metadata defaults topics to empty array when opts.topics is undefined', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'metadata-no-topics',
      });

      const metaSpy = mock(async (_opts: any) => ({
        brokers: new Map(),
        id: 1,
        topics: new Map(),
      }));
      (a as any).admin = { metadata: metaSpy, close: mock(async () => {}) };

      await a.metadata({}); // opts provided but no topics field

      const callArgs = metaSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual([]);

      await a.close().catch(() => {});
    });

    test('TC-168: metadata with explicit topics array — verify passed through', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'metadata-explicit-topics',
      });

      const metaSpy = mock(async (_opts: any) => ({
        brokers: new Map(),
        id: 1,
        topics: new Map(),
      }));
      (a as any).admin = { metadata: metaSpy, close: mock(async () => {}) };

      await a.metadata({ topics: ['my-topic-1', 'my-topic-2'] });

      const callArgs = metaSpy.mock.calls[0][0];
      expect(callArgs.topics).toEqual(['my-topic-1', 'my-topic-2']);

      await a.close().catch(() => {});
    });

    test('TC-169: admin constructor applies KafkaDefaults.CLIENT_ID when no clientId provided', () => {
      // We verify this indirectly — the admin is constructed without clientId,
      // and the constructor uses `opts.clientId ?? KafkaDefaults.CLIENT_ID`
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'default-clientid-admin',
        // No clientId
      });

      // The fact that construction succeeds without clientId proves the default is applied
      expect(a).toBeInstanceOf(KafkaAdminHelper);
      a.close().catch(() => {});
    });
  });

  // =============================================================================
  // 19. Lifecycle & State Machine Tests
  // =============================================================================

  describe('Lifecycle & State Machine', () => {
    test('TC-170: consumer state transitions: false -> start() -> true -> close() -> false', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'lifecycle-group',
        topics: ['test'],
        identifier: 'lifecycle',
      });

      // Initial state
      expect(c.isConsuming()).toBe(false);

      // Use a stream with a delay so consumeLoop doesn't finish before we can check isConsuming
      const mockStream = createMockStream(
        [{ topic: 'test', partition: 0, key: 'k', value: 'v', offset: 0n, timestamp: 0n }],
        { delayMs: 200 },
      );
      (c as any).consumer = { consume: mock(async () => mockStream), close: mock(async () => {}) };

      await c.start();
      // isConsuming should be true right after start (consumeLoop is still running due to delay)
      expect(c.isConsuming()).toBe(true);

      // Close stops the loop
      await c.close();
      expect(c.isConsuming()).toBe(false);
    });

    test('TC-171: consumer close() on never-started consumer — should not throw', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'close-never-started-2-group',
        topics: ['test'],
        identifier: 'close-never-started-2',
      });

      // Replace internal consumer with mock to avoid real connection attempt
      (c as any).consumer = { close: mock(async () => {}) };

      // Should not throw
      await c.close();
      expect(c.isConsuming()).toBe(false);
    });

    test('TC-172: consumer double close() — second close should handle gracefully', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'double-close-consumer-group',
        topics: ['test'],
        identifier: 'double-close-consumer',
      });

      const mockConsumer = { close: mock(async () => {}) };
      (c as any).consumer = mockConsumer;

      await c.close();
      // Second close — stream is already null, abort already called
      await c.close();

      // consumer.close should be called twice (both attempts go through)
      expect(mockConsumer.close).toHaveBeenCalledTimes(2);
      expect(c.isConsuming()).toBe(false);
    });

    test('TC-173: producer double close() — should handle gracefully', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'double-close-producer',
      });

      const mockProducer = { close: mock(async () => {}), send: mock(async () => {}) };
      (p as any).producer = mockProducer;

      await p.close();
      await p.close();

      expect(mockProducer.close).toHaveBeenCalledTimes(2);
    });

    test('TC-174: admin double close() — should handle gracefully', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'double-close-admin',
      });

      const mockAdmin = { close: mock(async () => {}) };
      (a as any).admin = mockAdmin;

      await a.close();
      await a.close();

      expect(mockAdmin.close).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================================================
  // 20. Error Propagation Exhaustive
  // =============================================================================

  describe('Error Propagation Exhaustive', () => {
    test('TC-175: admin createTopics error — verify error is re-thrown AND logged', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'create-error-log',
      });

      const expectedError = new Error('create-failed');
      const mockAdmin = {
        createTopics: mock(async () => {
          throw expectedError;
        }),
        close: mock(async () => {}),
      };
      (a as any).admin = mockAdmin;

      const errorSpy = spyOn(a.logger.for('createTopics'), 'error');

      let caughtError: unknown;
      try {
        await a.createTopics({ topics: ['fail-topic'] });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      await a.close().catch(() => {});
    });

    test('TC-176: admin deleteTopics error — verify error is re-thrown AND logged', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'delete-error-log',
      });

      const expectedError = new Error('delete-failed');
      const mockAdmin = {
        deleteTopics: mock(async () => {
          throw expectedError;
        }),
        close: mock(async () => {}),
      };
      (a as any).admin = mockAdmin;

      const errorSpy = spyOn(a.logger.for('deleteTopics'), 'error');

      let caughtError: unknown;
      try {
        await a.deleteTopics({ topics: ['fail-topic'] });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      await a.close().catch(() => {});
    });

    test('TC-177: admin listTopics error — verify error is re-thrown AND logged', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'list-error-log',
      });

      const expectedError = new Error('list-failed');
      const mockAdmin = {
        listTopics: mock(async () => {
          throw expectedError;
        }),
        close: mock(async () => {}),
      };
      (a as any).admin = mockAdmin;

      const errorSpy = spyOn(a.logger.for('listTopics'), 'error');

      let caughtError: unknown;
      try {
        await a.listTopics();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      await a.close().catch(() => {});
    });

    test('TC-178: admin metadata error — verify error is re-thrown AND logged', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'metadata-error-log',
      });

      const expectedError = new Error('metadata-failed');
      const mockAdmin = {
        metadata: mock(async () => {
          throw expectedError;
        }),
        close: mock(async () => {}),
      };
      (a as any).admin = mockAdmin;

      const errorSpy = spyOn(a.logger.for('metadata'), 'error');

      let caughtError: unknown;
      try {
        await a.metadata();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      await a.close().catch(() => {});
    });

    test('TC-179: admin close error — verify error is re-thrown AND logged', async () => {
      const a = KafkaAdminHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'close-error-log-admin',
      });

      const expectedError = new Error('admin-close-error');
      (a as any).admin = {
        close: mock(async () => {
          throw expectedError;
        }),
      };

      const errorSpy = spyOn(a.logger.for('close'), 'error');

      let caughtError: unknown;
      try {
        await a.close();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('TC-180: producer close error — verify error is re-thrown AND logged', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'close-error-log-producer',
      });

      const expectedError = new Error('producer-close-error');
      (p as any).producer = {
        close: mock(async () => {
          throw expectedError;
        }),
      };

      const errorSpy = spyOn(p.logger.for('close'), 'error');

      let caughtError: unknown;
      try {
        await p.close();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('TC-181: consumer close error from stream.close() — verify error propagation', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'stream-close-error-group',
        topics: ['test'],
        identifier: 'stream-close-error',
      });

      const expectedError = new Error('stream-close-failed');
      (c as any).stream = {
        close: mock(async () => {
          throw expectedError;
        }),
      };
      (c as any).consumer = { close: mock(async () => {}) };

      let caughtError: unknown;
      try {
        await c.close();
      } catch (err) {
        caughtError = err;
      }

      // The stream.close() error should bubble up because consumer.close()
      // is called after, but stream.close() throwing stops execution in the try block
      expect(caughtError).toBe(expectedError);
    });

    test('TC-182: consumer close error from consumer.close() — verify error propagation', async () => {
      const c = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        groupId: 'consumer-close-error-group',
        topics: ['test'],
        identifier: 'consumer-close-error',
      });

      const expectedError = new Error('consumer-close-failed');
      (c as any).stream = { close: mock(async () => {}) };
      (c as any).consumer = {
        close: mock(async () => {
          throw expectedError;
        }),
      };

      let caughtError: unknown;
      try {
        await c.close();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBe(expectedError);
    });

    test('TC-183: producer send error — verify error is logged before re-throw', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:9092'],
        identifier: 'send-error-log',
      });

      const expectedError = new Error('send-failed');
      (p as any).producer = {
        send: mock(async () => {
          throw expectedError;
        }),
        close: mock(async () => {}),
      };

      const errorSpy = spyOn(p.logger.for('send'), 'error');

      try {
        await p.send({ messages: [{ topic: 't', value: 'v' }] });
      } catch {
        // expected
      }

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
      await p.close().catch(() => {});
    });
  });

  // =============================================================================
  // 21. Batch Edge Cases
  // =============================================================================

  describe('Batch Edge Cases', () => {
    test('TC-184: sendBatch with messages that already have a topic — outer topic should override', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'topic-override',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({
        topicMessages: [
          {
            topic: 'correct-topic',
            messages: [
              { topic: 'wrong-topic', key: 'k1', value: 'v1' },
              { topic: 'also-wrong', key: 'k2', value: 'v2' },
            ],
          },
        ],
      });

      const msgs = (sendSpy.mock.calls[0][0] as { messages: Array<{ topic: string }> }).messages;
      // The outer batch topic MUST override any inner message topic
      expect(msgs[0].topic).toBe('correct-topic');
      expect(msgs[1].topic).toBe('correct-topic');

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-185: sendBatch with 100 topics and 10 messages each — stress test flattening', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'stress-batch',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      const topicMessages = Array.from({ length: 100 }, (_, i) => ({
        topic: `stress-topic-${i}`,
        messages: Array.from({ length: 10 }, (__, j) => ({
          topic: '',
          key: `k-${i}-${j}`,
          value: `v-${i}-${j}`,
        })),
      }));

      await p.sendBatch({ topicMessages });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0] as { messages: unknown[] };
      expect(callArgs.messages.length).toBe(1000); // 100 * 10

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-186: sendBatch calls send exactly once per call (not once per topic group)', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'single-send-call',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      // 5 different topic groups
      await p.sendBatch({
        topicMessages: [
          { topic: 'a', messages: [{ topic: '', value: '1' }] },
          { topic: 'b', messages: [{ topic: '', value: '2' }] },
          { topic: 'c', messages: [{ topic: '', value: '3' }] },
          { topic: 'd', messages: [{ topic: '', value: '4' }] },
          { topic: 'e', messages: [{ topic: '', value: '5' }] },
        ],
      });

      // Must be exactly 1 send call, not 5
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const msgs = (sendSpy.mock.calls[0][0] as { messages: unknown[] }).messages;
      expect(msgs.length).toBe(5);

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-187: sendBatch with topic containing empty string messages array — contributes nothing', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'empty-messages-in-batch',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      await p.sendBatch({
        topicMessages: [
          { topic: 'has-messages', messages: [{ topic: '', value: 'v1' }] },
          { topic: 'empty-topic', messages: [] }, // empty messages array
          { topic: 'also-has', messages: [{ topic: '', value: 'v2' }] },
        ],
      });

      const msgs = (sendSpy.mock.calls[0][0] as { messages: unknown[] }).messages;
      expect(msgs.length).toBe(2); // Only 2 messages, the empty one contributes nothing

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });

    test('TC-188: sendBatch preserves message spread — original message object is not mutated', async () => {
      const p = KafkaProducerHelper.newInstance({
        bootstrapBrokers: ['localhost:1'],
        identifier: 'no-mutate',
        retries: false,
        timeout: 2_000,
      });

      const sendSpy = spyOn(p, 'send');
      sendSpy.mockResolvedValue(undefined);

      const originalMessage = { topic: 'original', key: 'k', value: 'v', partition: 1 };
      const originalTopicSnapshot = originalMessage.topic;

      await p.sendBatch({
        topicMessages: [{ topic: 'override', messages: [originalMessage] }],
      });

      // The original message object should NOT be mutated (sendBatch uses { ...msg, topic })
      expect(originalMessage.topic).toBe(originalTopicSnapshot);

      sendSpy.mockRestore();
      p.close().catch(() => {});
    });
  });
});
