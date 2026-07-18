import type { Consumer, Message, SendOptions } from '@platformatic/kafka';
import { Producer } from '@platformatic/kafka';
import { BaseKafkaHelper } from './base';
import { KafkaDefaults } from './common/constants';
import type {
  IKafkaProducerOptions,
  IKafkaTransactionContext,
  TKafkaTransactionCallback,
} from './common/types';

/**
 * Wrapper around `@platformatic/kafka` Producer with lifecycle management, health tracking,
 * graceful shutdown, and a transaction helper. `runInTransaction` requires both
 * `transactionalId` and `idempotent` to be set on the producer.
 */
export class KafkaProducerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseKafkaHelper<Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>> {
  constructor(opts: IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    super({
      scope: KafkaProducerHelper.name,
      identifier: opts.identifier ?? 'kafka-producer',
      shutdownTimeout: opts.shutdownTimeout,
      client: new Producer({
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
        registry: opts.registry,
      }),
      onBrokerConnect: opts.onBrokerConnect,
      onBrokerDisconnect: opts.onBrokerDisconnect,
    });

    this.configureBrokerEvents();

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
  >(opts: IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    return new KafkaProducerHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>(opts);
  }

  getProducer(): Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.client;
  }

  async runInTransaction<ResultType>(
    callback: TKafkaTransactionCallback<
      ResultType,
      KeyType,
      ValueType,
      HeaderKeyType,
      HeaderValueType
    >,
  ): Promise<ResultType> {
    const transaction = await this.client.beginTransaction();

    this.logger.info('[runInTransaction] Transaction STARTED | Id: %s', transaction.id);

    try {
      const transactionContext: IKafkaTransactionContext<
        KeyType,
        ValueType,
        HeaderKeyType,
        HeaderValueType
      > = {
        transaction,
        send: (opts: SendOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) => {
          return transaction.send(opts);
        },
        addConsumer: <
          ConsumerKeyType,
          ConsumerValueType,
          ConsumerHeaderKeyType,
          ConsumerHeaderValueType,
        >(
          consumer: Consumer<
            ConsumerKeyType,
            ConsumerValueType,
            ConsumerHeaderKeyType,
            ConsumerHeaderValueType
          >,
        ) => {
          return transaction.addConsumer(consumer);
        },
        addOffset: <MessageKeyType, MessageValueType, MessageHeaderKeyType, MessageHeaderValueType>(
          message: Message<
            MessageKeyType,
            MessageValueType,
            MessageHeaderKeyType,
            MessageHeaderValueType
          >,
        ) => {
          return transaction.addOffset(message);
        },
      };

      const result = await callback(transactionContext);
      await transaction.commit();

      this.logger.info('[runInTransaction] Transaction COMMITTED | Id: %s', transaction.id);

      return result;
    } catch (error) {
      this.logger.error(
        '[runInTransaction] Transaction ABORTED | Id: %s | Error: %s',
        transaction.id,
        error,
      );

      await transaction.abort();
      throw error;
    }
  }

  protected override closeClient(): Promise<void> {
    return this.closeClientWithCallback();
  }

  async close(opts?: { isForce?: boolean }): Promise<void> {
    const force = opts?.isForce ?? false;

    if (force) {
      await this.closeClient();
    } else {
      try {
        await this.gracefulCloseClient();
      } catch {
        this.logger.warn('[close] Graceful shutdown timed out, forcing close');
        await this.closeClient();
      }
    }

    this.resetHealthState();
    this.logger.info('[close] Producer closed | Force: %s', force);
  }
}
