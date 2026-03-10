import { BaseHelper } from '@venizia/ignis-helpers';
import { Consumer } from '@platformatic/kafka';
import { KafkaDefaults } from './common/constants';
import type { IKafkaConsumerOpts } from './common/types';

/**
 * KafkaConsumerHelper — Thin wrapper around `@platformatic/kafka` Consumer.
 *
 * Provides scoped logging and lifecycle management.
 * Use `getConsumer()` to access the full Consumer API directly.
 *
 * @example
 * const helper = KafkaConsumerHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'my-consumer',
 *   groupId: 'my-consumer-group',
 *   autocommit: false,
 * });
 *
 * const consumer = helper.getConsumer();
 *
 * // Use @platformatic/kafka Consumer API directly
 * const stream = await consumer.consume({
 *   topics: ['products-topic'],
 *   mode: 'committed',       // Resume from last committed offset
 *   fallbackMode: 'latest',  // If no committed offset, start from latest
 * });
 *
 * // Option 1: Async iterator
 * for await (const message of stream) {
 *   console.log(`${message.topic}:${message.partition} — ${message.key} → ${message.value}`);
 *   await message.commit();
 * }
 *
 * // Option 2: Event-based
 * stream.on('data', (message) => {
 *   console.log('Received:', message.value);
 * });
 *
 * // Lag monitoring
 * consumer.startLagMonitoring({ topics: ['products-topic'] }, 5000);
 * consumer.on('consumer:lag', (lag) => console.log('Lag:', lag));
 *
 * // Clean up
 * await stream.close();
 * await helper.close();
 */
export class KafkaConsumerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper {
  private readonly consumer: Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>;

  constructor(opts: IKafkaConsumerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    super({
      scope: KafkaConsumerHelper.name,
      identifier: opts.identifier ?? 'kafka-consumer',
    });

    this.consumer = new Consumer({
      clientId: opts.clientId,
      bootstrapBrokers: opts.bootstrapBrokers,
      sasl: opts.sasl,
      tls: opts.tls,
      ssl: opts.ssl,
      connectTimeout: opts.connectTimeout,
      requestTimeout: opts.requestTimeout,
      groupId: opts.groupId,
      groupInstanceId: opts.groupInstanceId,
      groupProtocol: opts.groupProtocol ?? KafkaDefaults.GROUP_PROTOCOL,
      deserializers: opts.deserializers,
      autocommit: opts.autocommit ?? KafkaDefaults.AUTOCOMMIT,
      sessionTimeout: opts.sessionTimeout ?? KafkaDefaults.SESSION_TIMEOUT,
      heartbeatInterval: opts.heartbeatInterval ?? KafkaDefaults.HEARTBEAT_INTERVAL,
      rebalanceTimeout:
        opts.rebalanceTimeout ?? opts.sessionTimeout ?? KafkaDefaults.SESSION_TIMEOUT,
      highWaterMark: opts.highWaterMark ?? KafkaDefaults.HIGH_WATER_MARK,
      minBytes: opts.minBytes ?? KafkaDefaults.MIN_BYTES,
      maxBytes: opts.maxBytes,
      maxWaitTime: opts.maxWaitTime,
      metadataMaxAge: opts.metadataMaxAge ?? KafkaDefaults.METADATA_MAX_AGE,
      retries: opts.retries ?? KafkaDefaults.RETRIES,
      retryDelay: opts.retryDelay ?? KafkaDefaults.RETRY_DELAY,
    });

    this.logger.info(
      '[constructor] Kafka Consumer CREATED | ClientId: %s | GroupId: %s | Brokers: %j',
      opts.clientId,
      opts.groupId,
      opts.bootstrapBrokers,
    );
  }

  static newInstance<
    KeyType = string,
    ValueType = string,
    HeaderKeyType = string,
    HeaderValueType = string,
  >(opts: IKafkaConsumerOpts<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    return new KafkaConsumerHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>(opts);
  }

  getConsumer(): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.consumer;
  }

  async close(isForce = true): Promise<void> {
    await Promise.resolve(this.consumer.close(isForce));
    this.logger.info('Consumer closed | Force: %s', isForce);
  }
}
