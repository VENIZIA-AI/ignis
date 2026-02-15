import { BaseHelper } from '@/helpers/base';
import { Producer } from '@platformatic/kafka';
import { KafkaDefaults } from './common';
import {
  type IKafkaProduceMessage,
  type IKafkaProducerOptions,
  type IKafkaSendOptions,
} from './common/types';

export class KafkaProducerHelper<
  Key = unknown,
  Value = unknown,
  HeaderKey = unknown,
  HeaderValue = unknown,
> extends BaseHelper {
  private producer: Producer<Key, Value, HeaderKey, HeaderValue>;
  private onError?: (opts: { error: Error }) => void;

  constructor(opts: IKafkaProducerOptions<Key, Value, HeaderKey, HeaderValue>) {
    super({ scope: KafkaProducerHelper.name, identifier: opts.identifier });

    this.onError = opts.onError;

    this.producer = new Producer<Key, Value, HeaderKey, HeaderValue>({
      clientId: opts.clientId ?? KafkaDefaults.CLIENT_ID,
      bootstrapBrokers: opts.bootstrapBrokers,
      timeout: opts.timeout,
      retries: opts.retries,
      retryDelay: opts.retryDelay,
      acks: opts.acks,
      autocreateTopics: opts.autocreateTopics,
      ...(opts.serializers ? { serializers: opts.serializers } : {}),
    });

    this.wireLifecycleHooks(opts);
    this.logger.for('constructor').info('Producer initialized | ID: %s', this.identifier);
  }

  private wireLifecycleHooks(
    opts: IKafkaProducerOptions<Key, Value, HeaderKey, HeaderValue>,
  ): void {
    if (opts.onConnected) {
      this.producer.on('client:broker:connect', () => {
        try {
          opts.onConnected!();
        } catch (err) {
          this.logger
            .for('onConnected')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }

    if (opts.onDisconnected) {
      this.producer.on('client:broker:disconnect', () => {
        try {
          opts.onDisconnected!();
        } catch (err) {
          this.logger
            .for('onDisconnected')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }
  }

  static newInstance<K = unknown, V = unknown, HK = unknown, HV = unknown>(
    opts: IKafkaProducerOptions<K, V, HK, HV>,
  ) {
    return new KafkaProducerHelper<K, V, HK, HV>(opts);
  }

  async send(opts: IKafkaSendOptions): Promise<void> {
    try {
      await this.producer.send({
        messages: opts.messages as any[],
        acks: opts.acks,
      });

      this.logger
        .for(this.send.name)
        .debug('Sent %d message(s) | ID: %s', opts.messages.length, this.identifier);
    } catch (error) {
      this.logger
        .for(this.send.name)
        .error('Failed to send messages: %s | ID: %s', error, this.identifier);
      this.onError?.({ error: error as Error });
      throw error;
    }
  }

  async sendBatch(opts: {
    topicMessages: Array<{ topic: string; messages: IKafkaProduceMessage[] }>;
    acks?: number;
  }): Promise<void> {
    const allMessages: IKafkaProduceMessage[] = [];

    for (const batch of opts.topicMessages) {
      for (const msg of batch.messages) {
        allMessages.push({ ...msg, topic: batch.topic });
      }
    }

    await this.send({ messages: allMessages, acks: opts.acks });
  }

  getProducer(): Producer<Key, Value, HeaderKey, HeaderValue> {
    return this.producer;
  }

  async close(): Promise<void> {
    try {
      await this.producer?.close();
      this.logger
        .for(this.close.name)
        .info('Producer closed successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing producer: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }
}
