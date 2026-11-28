import { SASLMechanisms } from '@platformatic/kafka';
import { describe, expect, test } from 'bun:test';
import { BaseKafkaHelper } from '@/modules/queue/kafka/base';
import { KafkaDefaults } from '@/modules/queue/kafka/common/constants';

describe('BaseKafkaHelper.buildConnectionOptions', () => {
  const required = { clientId: 'orders', bootstrapBrokers: ['127.0.0.1:9092'] };

  test('fills the retry defaults', () => {
    expect(BaseKafkaHelper['buildConnectionOptions'](required)).toMatchObject({
      ...required,
      retries: KafkaDefaults.RETRIES,
      retryDelay: KafkaDefaults.RETRY_DELAY,
    });
  });

  test('keeps the connection options given, and no other key', () => {
    const connection = {
      ...required,
      sasl: { mechanism: SASLMechanisms.PLAIN, username: 'user', password: 'password' },
      tls: { rejectUnauthorized: true },
      ssl: { rejectUnauthorized: true },
      connectTimeout: 1,
      requestTimeout: 2,
      retries: 0,
      retryDelay: 0,
    };

    expect(
      BaseKafkaHelper['buildConnectionOptions'](Object.assign({ identifier: 'x' }, connection)),
    ).toStrictEqual(connection);
  });
});
