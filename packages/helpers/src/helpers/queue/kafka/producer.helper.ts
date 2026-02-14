import { getError } from '@/helpers/error';
import { Producer, ProducerConfig, ProducerRecord, ProducerBatch } from 'kafkajs';
import { BaseKafkaHelper } from './base.helper';
import { IKafkaProducerOpts, KafkaHelperRoles } from './types';

export class KafkaProducerHelper extends BaseKafkaHelper {
  private producer: Producer;
  private producerConfig: ProducerConfig;

  private onProducerConnect?: () => void;
  private onProducerDisconnect?: () => void;

  constructor(opts: IKafkaProducerOpts) {
    super({
      ...opts,
      scope: KafkaProducerHelper.name,
      role: KafkaHelperRoles.ROLE_PRODUCER,
    });

    this.setupProducer(opts);
    this.configureProducer();
  }

  static newInstance(opts: IKafkaProducerOpts) {
    return new KafkaProducerHelper(opts);
  }

  protected setupProducer(opts: IKafkaProducerOpts) {
    this.producerConfig = opts.producerConfig;
    this.onProducerConnect = opts.onProducerConnect;
    this.onProducerDisconnect = opts.onProducerDisconnect;
  }

  protected configureProducer() {
    if (this.producerConfig === null || this.producerConfig === undefined) {
      this.logger
        .for(this.configureProducer.name)
        .error('Producer config is required | ID: %s', this.identifier);
      return;
    }

    try {
      this.producer = this.kafka.producer(this.producerConfig);
      const { CONNECT, DISCONNECT, REQUEST_TIMEOUT } = this.producer.events;

      this.producer.on(CONNECT, () => {
        this.logger.for('[Producer][Connect]').info('Producer CONNECTED | ID: %s', this.identifier);
        try {
          this.onProducerConnect?.();
        } catch (error) {
          this.logger
            .for('[Producer][Connect]')
            .error('Error in connect callback | Error: %s | ID: %s', error, this.identifier);
        }
      });

      this.producer.on(DISCONNECT, () => {
        this.logger
          .for('[Producer][Disconnect]')
          .info('Producer DISCONNECTED | ID: %s', this.identifier);
        try {
          this.onProducerDisconnect?.();
        } catch (error) {
          this.logger
            .for('[Producer][Disconnect]')
            .error('Error in disconnect callback | Error: %s | ID: %s', error, this.identifier);
        }
      });

      this.producer.on(REQUEST_TIMEOUT, payload => {
        this.logger
          .for('[Producer][RequestTimeout]')
          .warn('Producer request timeout | Payload: %j | ID: %s', payload, this.identifier);
      });

      this.logger
        .for(this.configureProducer.name)
        .info('Producer configured successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.configureProducer.name)
        .error('Failed to configure producer | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async connectProducer() {
    if (!this.producer) {
      this.logger
        .for(this.connectProducer.name)
        .error('No producer configured | ID: %s', this.identifier);
      throw getError({ message: 'No producer configured' });
    }

    try {
      this.logger
        .for(this.connectProducer.name)
        .info('Connecting producer... | ID: %s', this.identifier);
      await this.producer.connect();
      this.logger
        .for(this.connectProducer.name)
        .info('Producer connection initiated | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.connectProducer.name)
        .error('Failed to connect producer | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async disconnectProducer() {
    if (!this.producer) {
      this.logger
        .for(this.disconnectProducer.name)
        .warn('No producer to disconnect | ID: %s', this.identifier);
      return;
    }

    try {
      this.logger
        .for(this.disconnectProducer.name)
        .info('Disconnecting producer... | ID: %s', this.identifier);
      await this.producer.disconnect();
      this.logger
        .for(this.disconnectProducer.name)
        .info('Producer disconnection initiated | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.disconnectProducer.name)
        .error('Failed to disconnect producer | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  /**
   * Send messages to Kafka topic(s).
   * Automatically serializes message values to JSON.
   */
  async sendMessages(record: ProducerRecord) {
    if (!this.producer) {
      this.logger
        .for(this.sendMessages.name)
        .error('No producer configured | ID: %s', this.identifier);
      throw getError({ message: 'No producer configured' });
    }

    const { topic, messages, acks, timeout, compression } = record;

    try {
      const serializedMessages = messages.map(msg => ({
        key: msg.key,
        value: this.serialize(msg.value),
        headers: msg.headers,
        partition: msg.partition,
        timestamp: msg.timestamp,
      }));

      const result = await this.producer.send({
        topic,
        messages: serializedMessages,
        acks,
        timeout,
        compression,
      });

      this.logger
        .for(this.sendMessages.name)
        .info(
          'Messages sent | Topic: %s | Count: %d | ID: %s',
          topic,
          messages.length,
          this.identifier,
        );

      return result;
    } catch (error) {
      this.logger
        .for(this.sendMessages.name)
        .error(
          'Failed to send messages | Topic: %s | Error: %s | ID: %s',
          topic,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Send a batch of messages to multiple topics.
   */
  async sendBatch(batch: ProducerBatch) {
    if (!this.producer) {
      this.logger
        .for(this.sendBatch.name)
        .error('No producer configured | ID: %s', this.identifier);
      throw getError({ message: 'No producer configured' });
    }

    try {
      const { topicMessages } = batch;
      const serializedTopicMessages = topicMessages?.map(({ messages, ...opts }) => ({
        ...opts,
        messages: messages.map(msg => ({
          key: msg.key,
          value: this.serialize(msg.value),
          headers: msg.headers,
          partition: msg.partition,
          timestamp: msg.timestamp,
        })),
      }));

      const result = await this.producer.sendBatch({
        ...batch,
        topicMessages: serializedTopicMessages,
      });

      this.logger
        .for(this.sendBatch.name)
        .info('Batch sent | Topics: %d | ID: %s', batch.topicMessages?.length, this.identifier);

      return result;
    } catch (error) {
      this.logger
        .for(this.sendBatch.name)
        .error('Failed to send batch | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  protected serialize(value: any) {
    try {
      if (value === null || value === undefined) {
        return null;
      }
      if (Buffer.isBuffer(value)) {
        return value;
      }
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);
    } catch (error) {
      this.logger
        .for(this.serialize.name)
        .error('Failed to serialize value | Error: %s | ID: %s', error, this.identifier);
      throw getError({ message: `Serialization failed: ${error}` });
    }
  }

  /**
   * Get producer transaction support status.
   */
  isTransactional(): boolean {
    return this.producerConfig?.transactionalId !== undefined;
  }

  /**
   * Get producer instance for advanced operations.
   * Use with caution - direct access bypasses helper logging.
   */
  getProducer(): Producer {
    if (!this.producer) {
      throw getError({ message: 'No producer configured' });
    }
    return this.producer;
  }
}
