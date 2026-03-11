/** Kafka Helpers Test Suite */

import {
  KafkaAcks,
  KafkaAdminHelper,
  KafkaConsumerHelper,
  KafkaDefaults,
  KafkaGroupProtocol,
  KafkaProducerHelper,
} from '@/modules/queue/kafka';
import { Admin, Consumer, Producer } from '@platformatic/kafka';
import { describe, expect, test } from 'bun:test';

const BROKERS = ['127.0.0.1:9092'];
const CLIENT_ID = 'ignis-test';

// -------------------------------------------------------------------------
// KafkaGroupProtocol
// -------------------------------------------------------------------------

describe('KafkaGroupProtocol', () => {
  test('TC-001: should expose CLASSIC and CONSUMER constants', () => {
    expect(KafkaGroupProtocol.CLASSIC).toBe('classic');
    expect(KafkaGroupProtocol.CONSUMER).toBe('consumer');
  });

  test('TC-002: SCHEME_SET should contain all valid protocols', () => {
    expect(KafkaGroupProtocol.SCHEME_SET.size).toBe(2);
    expect(KafkaGroupProtocol.SCHEME_SET.has('classic')).toBe(true);
    expect(KafkaGroupProtocol.SCHEME_SET.has('consumer')).toBe(true);
  });

  test('TC-003: isValid should return true for valid protocols', () => {
    expect(KafkaGroupProtocol.isValid('classic')).toBe(true);
    expect(KafkaGroupProtocol.isValid('consumer')).toBe(true);
  });

  test('TC-004: isValid should return false for invalid protocols', () => {
    expect(KafkaGroupProtocol.isValid('invalid')).toBe(false);
    expect(KafkaGroupProtocol.isValid('')).toBe(false);
    expect(KafkaGroupProtocol.isValid('CLASSIC')).toBe(false);
  });
});

// -------------------------------------------------------------------------
// KafkaAcks
// -------------------------------------------------------------------------

describe('KafkaAcks', () => {
  test('TC-005: should expose NONE, LEADER, and ALL constants', () => {
    expect(KafkaAcks.NONE).toBe(0);
    expect(KafkaAcks.LEADER).toBe(1);
    expect(KafkaAcks.ALL).toBe(-1);
  });

  test('TC-005a: SCHEME_SET should contain all valid acks', () => {
    expect(KafkaAcks.SCHEME_SET.size).toBe(3);
    expect(KafkaAcks.SCHEME_SET.has(0)).toBe(true);
    expect(KafkaAcks.SCHEME_SET.has(1)).toBe(true);
    expect(KafkaAcks.SCHEME_SET.has(-1)).toBe(true);
  });

  test('TC-005b: isValid should return true for valid acks', () => {
    expect(KafkaAcks.isValid(0)).toBe(true);
    expect(KafkaAcks.isValid(1)).toBe(true);
    expect(KafkaAcks.isValid(-1)).toBe(true);
  });

  test('TC-005c: isValid should return false for invalid acks', () => {
    expect(KafkaAcks.isValid(2)).toBe(false);
    expect(KafkaAcks.isValid(-2)).toBe(false);
    expect(KafkaAcks.isValid(100)).toBe(false);
  });
});

// -------------------------------------------------------------------------
// KafkaDefaults
// -------------------------------------------------------------------------

describe('KafkaDefaults', () => {
  test('TC-006: should expose shared defaults', () => {
    expect(KafkaDefaults.RETRIES).toBe(3);
    expect(KafkaDefaults.RETRY_DELAY).toBe(1_000);
  });

  test('TC-007: should expose producer defaults', () => {
    expect(KafkaDefaults.STRICT).toBe(true);
    expect(KafkaDefaults.AUTOCREATE_TOPICS).toBe(false);
  });

  test('TC-008: should expose consumer defaults', () => {
    expect(KafkaDefaults.AUTOCOMMIT).toBe(false);
    expect(KafkaDefaults.SESSION_TIMEOUT).toBe(30_000);
    expect(KafkaDefaults.HEARTBEAT_INTERVAL).toBe(3_000);
    expect(KafkaDefaults.HIGH_WATER_MARK).toBe(1024);
    expect(KafkaDefaults.MIN_BYTES).toBe(1);
    expect(KafkaDefaults.METADATA_MAX_AGE).toBe(300_000);
    expect(KafkaDefaults.GROUP_PROTOCOL).toBe('classic');
  });
});

// -------------------------------------------------------------------------
// KafkaProducerHelper
// -------------------------------------------------------------------------

describe('KafkaProducerHelper', () => {
  describe('Construction', () => {
    test('TC-010: should create instance via newInstance()', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper).toBeInstanceOf(KafkaProducerHelper);
      expect(helper.getLogger()).toBeDefined();
    });

    test('TC-011: should create instance via constructor', () => {
      const helper = new KafkaProducerHelper({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper).toBeInstanceOf(KafkaProducerHelper);
    });

    test('TC-012: should use default identifier when not provided', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper.identifier).toBe('kafka-producer');
    });

    test('TC-013: should use custom identifier when provided', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        identifier: 'search-producer',
      });

      expect(helper.identifier).toBe('search-producer');
    });

    test('TC-014: should set scope to class name', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper.scope).toBe('KafkaProducerHelper');
    });

    test('TC-015: should accept all optional producer options', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        acks: -1,
        idempotent: true,
        compression: 'gzip',
        strict: false,
        autocreateTopics: true,
        transactionalId: 'tx-1',
        retries: 5,
        retryDelay: 2_000,
        identifier: 'custom',
      });

      expect(helper).toBeInstanceOf(KafkaProducerHelper);
    });
  });

  describe('getProducer()', () => {
    test('TC-020: should return a @platformatic/kafka Producer instance', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      const producer = helper.getProducer();
      expect(producer).toBeInstanceOf(Producer);
    });

    test('TC-021: should return the same instance on multiple calls', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      const p1 = helper.getProducer();
      const p2 = helper.getProducer();
      expect(p1).toBe(p2);
    });
  });

  describe('close()', () => {
    test('TC-030: close should be callable without error', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(() => helper.close()).not.toThrow();
    });

    test('TC-031: close with force=true should be callable', () => {
      const helper = KafkaProducerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(() => helper.close({ isForce: true })).not.toThrow();
    });
  });
});

// -------------------------------------------------------------------------
// KafkaConsumerHelper
// -------------------------------------------------------------------------

describe('KafkaConsumerHelper', () => {
  describe('Construction', () => {
    test('TC-040: should create instance via newInstance()', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      expect(helper).toBeInstanceOf(KafkaConsumerHelper);
      expect(helper.getLogger()).toBeDefined();
    });

    test('TC-041: should create instance via constructor', () => {
      const helper = new KafkaConsumerHelper({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      expect(helper).toBeInstanceOf(KafkaConsumerHelper);
    });

    test('TC-042: should use default identifier when not provided', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      expect(helper.identifier).toBe('kafka-consumer');
    });

    test('TC-043: should use custom identifier when provided', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
        identifier: 'search-consumer',
      });

      expect(helper.identifier).toBe('search-consumer');
    });

    test('TC-044: should set scope to class name', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      expect(helper.scope).toBe('KafkaConsumerHelper');
    });

    test('TC-045: should accept all optional consumer options', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
        autocommit: false,
        sessionTimeout: 15_000,
        heartbeatInterval: 5_000,
        rebalanceTimeout: 20_000,
        highWaterMark: 512,
        minBytes: 1,
        maxBytes: 1_048_576,
        maxWaitTime: 5_000,
        metadataMaxAge: 60_000,
        groupProtocol: 'classic',
        groupInstanceId: 'instance-1',
        retries: 5,
        retryDelay: 2_000,
        identifier: 'custom',
      });

      expect(helper).toBeInstanceOf(KafkaConsumerHelper);
    });

    test('TC-047: should accept autocommit as number (interval ms)', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
        autocommit: 5_000,
      });

      expect(helper).toBeInstanceOf(KafkaConsumerHelper);
    });
  });

  describe('getConsumer()', () => {
    test('TC-050: should return a @platformatic/kafka Consumer instance', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      const consumer = helper.getConsumer();
      expect(consumer).toBeInstanceOf(Consumer);
    });

    test('TC-051: should return the same instance on multiple calls', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      const c1 = helper.getConsumer();
      const c2 = helper.getConsumer();
      expect(c1).toBe(c2);
    });

    test('TC-052: consumer should have the correct groupId', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'my-unique-group',
      });

      const consumer = helper.getConsumer();
      expect(consumer.groupId).toBe('my-unique-group');
    });
  });

  describe('close()', () => {
    test('TC-060: close should default to force=true', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      expect(() => helper.close()).not.toThrow();
    });

    test('TC-061: close with force=false should be callable', () => {
      const helper = KafkaConsumerHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        groupId: 'test-group',
      });

      expect(() => helper.close({ isForce: false })).not.toThrow();
    });
  });
});

// -------------------------------------------------------------------------
// KafkaAdminHelper
// -------------------------------------------------------------------------

describe('KafkaAdminHelper', () => {
  describe('Construction', () => {
    test('TC-070: should create instance via newInstance()', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper).toBeInstanceOf(KafkaAdminHelper);
      expect(helper.getLogger()).toBeDefined();
    });

    test('TC-071: should create instance via constructor', () => {
      const helper = new KafkaAdminHelper({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper).toBeInstanceOf(KafkaAdminHelper);
    });

    test('TC-072: should use default identifier when not provided', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper.identifier).toBe('kafka-admin');
    });

    test('TC-073: should use custom identifier when provided', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        identifier: 'cluster-admin',
      });

      expect(helper.identifier).toBe('cluster-admin');
    });

    test('TC-074: should set scope to class name', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(helper.scope).toBe('KafkaAdminHelper');
    });

    test('TC-075: should accept optional retries and retryDelay', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
        retries: 10,
        retryDelay: 500,
      });

      expect(helper).toBeInstanceOf(KafkaAdminHelper);
    });
  });

  describe('getAdmin()', () => {
    test('TC-080: should return a @platformatic/kafka Admin instance', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      const admin = helper.getAdmin();
      expect(admin).toBeInstanceOf(Admin);
    });

    test('TC-081: should return the same instance on multiple calls', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      const a1 = helper.getAdmin();
      const a2 = helper.getAdmin();
      expect(a1).toBe(a2);
    });
  });

  describe('close()', () => {
    test('TC-090: close should be callable without error', () => {
      const helper = KafkaAdminHelper.newInstance({
        bootstrapBrokers: BROKERS,
        clientId: CLIENT_ID,
      });

      expect(() => helper.close()).not.toThrow();
    });
  });
});

// -------------------------------------------------------------------------
// Module exports
// -------------------------------------------------------------------------

describe('Module exports', () => {
  test('TC-100: should export all three helpers', () => {
    expect(KafkaProducerHelper).toBeDefined();
    expect(KafkaConsumerHelper).toBeDefined();
    expect(KafkaAdminHelper).toBeDefined();
  });

  test('TC-101: should export KafkaGroupProtocol', () => {
    expect(KafkaGroupProtocol).toBeDefined();
    expect(typeof KafkaGroupProtocol.isValid).toBe('function');
  });

  test('TC-102: all helpers should have static newInstance factory', () => {
    expect(typeof KafkaProducerHelper.newInstance).toBe('function');
    expect(typeof KafkaConsumerHelper.newInstance).toBe('function');
    expect(typeof KafkaAdminHelper.newInstance).toBe('function');
  });
});
