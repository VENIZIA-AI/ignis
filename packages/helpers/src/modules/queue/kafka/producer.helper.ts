import { Producer } from '@platformatic/kafka';
import { BaseHelper } from '@venizia/ignis-helpers';
import { KafkaDefaults } from './common/constants';
import type { IKafkaProducerOpts } from './common/types';

/**
 * KafkaProducerHelper — Thin wrapper around `@platformatic/kafka` Producer.
 *
 * Provides scoped logging and lifecycle management.
 * Use `getProducer()` to access the full Producer API directly.
 *
 * @example
 * const helper = KafkaProducerHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'my-producer',
 *   acks: -1,
 *   idempotent: true,
 * });
 *
 * const producer = helper.getProducer();
 *
 * // Use @platformatic/kafka Producer API directly
 * await producer.send({
 *   messages: [
 *     {
 *       topic: 'products',
 *       key: 'product-123',
 *       value: JSON.stringify({ id: '123', name: 'Widget' }),
 *       headers: { source: 'search-service' },
 *     },
 *   ],
 * });
 *
 * // Tombstone (null value for deletion)
 * await producer.send({
 *   messages: [{ topic: 'products', key: 'product-456', value: undefined }],
 * });
 *
 * // Use ProducerStream for high-throughput with auto-batching
 * const stream = producer.asStream({ batchSize: 100, batchTime: 1000 });
 * stream.write({ topic: 'events', key: 'e1', value: JSON.stringify({ type: 'click' }) });
 * await stream.close();
 *
 * await helper.close();
 */
export class KafkaProducerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper {
  private readonly producer: Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>;

  constructor(opts: IKafkaProducerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    super({
      scope: KafkaProducerHelper.name,
      identifier: opts.identifier ?? 'kafka-producer',
    });

    this.producer = new Producer({
      clientId: opts.clientId,
      bootstrapBrokers: opts.bootstrapBrokers,
      sasl: opts.sasl,
      tls: opts.tls,
      ssl: opts.ssl,
      connectTimeout: opts.connectTimeout,
      requestTimeout: opts.requestTimeout,
      serializers: opts.serializers,
      strict: opts.strict ?? KafkaDefaults.STRICT,
      autocreateTopics: opts.autocreateTopics ?? KafkaDefaults.AUTOCREATE_TOPICS,
      compression: opts.compression,
      acks: opts.acks,
      idempotent: opts.idempotent,
      transactionalId: opts.transactionalId,
      retries: opts.retries ?? KafkaDefaults.RETRIES,
      retryDelay: opts.retryDelay ?? KafkaDefaults.RETRY_DELAY,
    });

    this.logger.info(
      '[constructor] Kafka Producer CREATED | ClientId: %s | Brokers: %j',
      opts.clientId,
      opts.bootstrapBrokers,
    );
  }

  static newInstance<
    KeyType = string,
    ValueType = string,
    HeaderKeyType = string,
    HeaderValueType = string,
  >(opts: IKafkaProducerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    return new KafkaProducerHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>(opts);
  }

  getProducer(): Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.producer;
  }

  async close(opts?: { isForce?: boolean }): Promise<void> {
    await this.producer.close(opts?.isForce);
    this.logger.info('Producer closed | Force: %s', opts?.isForce ?? false);
  }
}
