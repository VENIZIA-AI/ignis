import { getError } from '@/helpers/error';
import {
  Consumer,
  ConsumerConfig,
  ConsumerRunConfig,
  EachBatchPayload,
  EachMessagePayload,
  TopicPartition,
} from 'kafkajs';
import { BaseKafkaHelper } from './base.helper';
import { IKafkaConsumerOpts, KafkaHelperRoles } from './types';

export class KafkaConsumerHelper extends BaseKafkaHelper {
  private consumer: Consumer;
  private autoCommit?: boolean;
  private fromBeginning?: boolean;
  private consumerConfig: ConsumerConfig;
  private partitionsConsumedConcurrently?: number;

  private onConsumerConnect?: () => void;
  private onConsumerDisconnect?: () => void;
  private onMessage?: (payload: EachMessagePayload) => Promise<void>;
  private onBatch?: (payload: EachBatchPayload) => Promise<void>;
  private onConsumerCrash?: (payload: { error: Error; groupId: string }) => void;
  private onConsumerGroupJoin?: (payload: { groupId: string; memberId: string }) => void;

  constructor(opts: IKafkaConsumerOpts) {
    super({
      ...opts,
      scope: KafkaConsumerHelper.name,
      role: KafkaHelperRoles.ROLE_CONSUMER,
    });

    this.setupConsumer(opts);
    this.configureConsumer();
  }

  static newInstance(opts: IKafkaConsumerOpts) {
    return new KafkaConsumerHelper(opts);
  }

  protected setupConsumer(opts: IKafkaConsumerOpts) {
    this.consumerConfig = opts.consumerConfig;
    this.autoCommit = opts.autoCommit;
    this.fromBeginning = opts.fromBeginning;
    this.partitionsConsumedConcurrently = opts.partitionsConsumedConcurrently;
    this.onConsumerConnect = opts.onConsumerConnect;
    this.onConsumerDisconnect = opts.onConsumerDisconnect;
    this.onMessage = opts.onMessage;
    this.onBatch = opts.onBatch;
    this.onConsumerCrash = opts.onConsumerCrash;
    this.onConsumerGroupJoin = opts.onConsumerGroupJoin;
  }

  protected configureConsumer() {
    if (this.consumerConfig === null || this.consumerConfig === undefined) {
      this.logger
        .for(this.configureConsumer.name)
        .error('Consumer config is required | ID: %s', this.identifier);
      return;
    }

    try {
      this.consumer = this.kafka.consumer(this.consumerConfig);
      const { CONNECT, DISCONNECT, CRASH, GROUP_JOIN, REQUEST_TIMEOUT } = this.consumer.events;

      this.consumer.on(CONNECT, () => {
        this.logger.for('[Consumer][Connect]').info('Consumer CONNECTED | ID: %s', this.identifier);
        try {
          this.onConsumerConnect?.();
        } catch (error) {
          this.logger
            .for('[Consumer][Connect]')
            .error('Error in connect callback | Error: %s | ID: %s', error, this.identifier);
        }
      });

      this.consumer.on(DISCONNECT, () => {
        this.logger
          .for('[Consumer][Disconnect]')
          .info('Consumer DISCONNECTED | ID: %s', this.identifier);
        try {
          this.onConsumerDisconnect?.();
        } catch (error) {
          this.logger
            .for('[Consumer][Disconnect]')
            .error('Error in disconnect callback | Error: %s | ID: %s', error, this.identifier);
        }
      });

      this.consumer.on(CRASH, event => {
        this.logger
          .for('[Consumer][Crash]')
          .error(
            'Consumer CRASHED | Error: %s | GroupId: %s | ID: %s',
            event.payload.error,
            event.payload.groupId,
            this.identifier,
          );
        try {
          this.onConsumerCrash?.(event.payload);
        } catch (error) {
          this.logger
            .for('[Consumer][Crash]')
            .error('Error in crash callback | Error: %s | ID: %s', error, this.identifier);
        }
      });

      this.consumer.on(GROUP_JOIN, event => {
        this.logger
          .for('[Consumer][GroupJoin]')
          .info(
            'Consumer joined group | GroupId: %s | MemberId: %s | ID: %s',
            event.payload.groupId,
            event.payload.memberId,
            this.identifier,
          );
        try {
          this.onConsumerGroupJoin?.(event.payload);
        } catch (error) {
          this.logger
            .for('[Consumer][GroupJoin]')
            .error('Error in group join callback | Error: %s | ID: %s', error, this.identifier);
        }
      });

      this.consumer.on(REQUEST_TIMEOUT, payload => {
        this.logger
          .for('[Consumer][RequestTimeout]')
          .warn('Consumer request timeout | Payload: %j | ID: %s', payload, this.identifier);
      });

      this.logger
        .for(this.configureConsumer.name)
        .info('Consumer configured successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.configureConsumer.name)
        .error('Failed to configure consumer | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async connectConsumer() {
    if (!this.consumer) {
      this.logger
        .for(this.connectConsumer.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    try {
      this.logger
        .for(this.connectConsumer.name)
        .info('Connecting consumer... | ID: %s', this.identifier);
      await this.consumer.connect();
      this.logger
        .for(this.connectConsumer.name)
        .info('Consumer connection initiated | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.connectConsumer.name)
        .error('Failed to connect consumer | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async disconnectConsumer() {
    if (!this.consumer) {
      this.logger
        .for(this.disconnectConsumer.name)
        .warn('No consumer to disconnect | ID: %s', this.identifier);
      return;
    }

    try {
      this.logger
        .for(this.disconnectConsumer.name)
        .info('Disconnecting consumer... | ID: %s', this.identifier);
      await this.consumer.disconnect();
      this.logger
        .for(this.disconnectConsumer.name)
        .info('Consumer disconnection initiated | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.disconnectConsumer.name)
        .error('Failed to disconnect consumer | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async subscribeToTopics(topics: string[]) {
    if (!this.consumer) {
      this.logger
        .for(this.subscribeToTopics.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    if (!topics || topics.length === 0) {
      this.logger
        .for(this.subscribeToTopics.name)
        .warn('No topics provided for subscription | ID: %s', this.identifier);
      return;
    }

    try {
      this.logger
        .for(this.subscribeToTopics.name)
        .info('Subscribing to topics | Topics: %j | ID: %s', topics, this.identifier);
      await this.consumer.subscribe({ topics, fromBeginning: this.fromBeginning });
      this.logger
        .for(this.subscribeToTopics.name)
        .info(
          'Successfully subscribed | Topics: %j | FromBeginning: %s | ID: %s',
          topics,
          this.fromBeginning ?? false,
          this.identifier,
        );
    } catch (error) {
      this.logger
        .for(this.subscribeToTopics.name)
        .error(
          'Failed to subscribe to topics | Topics: %j | Error: %s | ID: %s',
          topics,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  async assignToPartitions(partitions: TopicPartition[]) {
    if (!this.consumer) {
      this.logger
        .for(this.assignToPartitions.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    if (!partitions || partitions.length === 0) {
      this.logger
        .for(this.assignToPartitions.name)
        .warn('No partitions provided for assignment | ID: %s', this.identifier);
      return;
    }

    try {
      this.logger
        .for(this.assignToPartitions.name)
        .info('Assigning partitions | Partitions: %j | ID: %s', partitions, this.identifier);
      // Cast to any because assign is missing from Consumer type definition in this version
      // but is available in the runtime
      await (this.consumer as any).assign(partitions);
      this.logger
        .for(this.assignToPartitions.name)
        .info(
          'Successfully assigned partitions | Count: %d | ID: %s',
          partitions.length,
          this.identifier,
        );
    } catch (error) {
      this.logger
        .for(this.assignToPartitions.name)
        .error(
          'Failed to assign partitions | Partitions: %j | Error: %s | ID: %s',
          partitions,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  async runConsumer(config?: Partial<ConsumerRunConfig>): Promise<void> {
    if (!this.consumer) {
      this.logger
        .for(this.runConsumer.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    try {
      this.logger
        .for(this.runConsumer.name)
        .info(
          'Starting consumer run loop | Mode: %s | AutoCommit: %s | ID: %s',
          this.onBatch ? 'BATCH' : 'SINGLE',
          this.autoCommit ?? true,
          this.identifier,
        );

      // Use batch processing if onBatch is provided, otherwise use single message processing
      if (this.onBatch) {
        await this.consumer.run({
          autoCommit: this.autoCommit,
          partitionsConsumedConcurrently: this.partitionsConsumedConcurrently,
          eachBatch: async (payload: EachBatchPayload) => {
            try {
              await this.onBatch!(payload);
            } catch (error) {
              // TODO: [DLQ] Implement Dead Letter Queue strategy
              // - Send failed batch to DLQ topic
              // - Commit offsets if DLQ send successful to avoid blocking
              this.logger
                .for('[Consumer][EachBatch]')
                .error(
                  'Error processing batch | Topic: %s | Partition: %d | Count: %d | Error: %s | ID: %s',
                  payload.batch.topic,
                  payload.batch.partition,
                  payload.batch.messages.length,
                  error,
                  this.identifier,
                );
              throw error;
            }
          },
          ...config,
        });
      } else {
        await this.consumer.run({
          autoCommit: this.autoCommit,
          eachMessage: async (payload: EachMessagePayload) => {
            if (!this.onMessage) {
              this.logger
                .for('[Consumer][EachMessage]')
                .info(
                  'Received message | Topic: %s | Partition: %d | Offset: %s | Key: %s | ID: %s',
                  payload.topic,
                  payload.partition,
                  payload.message.offset,
                  payload.message.key?.toString(),
                  this.identifier,
                );
              return;
            }

            try {
              // TODO: [Deserialization] Implement automatic deserialization of message value
              // const value = this.deserialize(payload.message.value);
              await this.onMessage(payload);
            } catch (error) {
              // TODO: [DLQ] Implement Dead Letter Queue strategy
              // - Send failed message to DLQ topic
              // - Commit offset if DLQ send successful to avoid blocking
              this.logger
                .for('[Consumer][EachMessage]')
                .error(
                  'Error processing message | Topic: %s | Partition: %d | Offset: %s | Error: %s | ID: %s',
                  payload.topic,
                  payload.partition,
                  payload.message.offset,
                  error,
                  this.identifier,
                );
              throw error;
            }
          },
          ...config,
        });
      }

      this.logger
        .for(this.runConsumer.name)
        .info('Consumer run loop started successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.runConsumer.name)
        .error('Failed to start consumer run loop | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  pauseConsumer(topics: Array<{ topic: string; partitions?: number[] }>): void {
    if (!this.consumer) {
      this.logger
        .for(this.pauseConsumer.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    if (!topics || topics.length === 0) {
      this.logger
        .for(this.pauseConsumer.name)
        .warn('No topics provided for pause | ID: %s', this.identifier);
      return;
    }

    try {
      this.consumer.pause(topics);
      this.logger
        .for(this.pauseConsumer.name)
        .info('Consumer paused | Topics: %j | ID: %s', topics, this.identifier);
    } catch (error) {
      this.logger
        .for(this.pauseConsumer.name)
        .error(
          'Failed to pause consumer | Topics: %j | Error: %s | ID: %s',
          topics,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  resumeConsumer(topics: Array<{ topic: string; partitions?: number[] }>): void {
    if (!this.consumer) {
      this.logger
        .for(this.resumeConsumer.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    if (!topics || topics.length === 0) {
      this.logger
        .for(this.resumeConsumer.name)
        .warn('No topics provided for resume | ID: %s', this.identifier);
      return;
    }

    try {
      this.consumer.resume(topics);
      this.logger
        .for(this.resumeConsumer.name)
        .info('Consumer resumed | Topics: %j | ID: %s', topics, this.identifier);
    } catch (error) {
      this.logger
        .for(this.resumeConsumer.name)
        .error(
          'Failed to resume consumer | Topics: %j | Error: %s | ID: %s',
          topics,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Seek to a specific offset for topic partitions.
   */
  async seek(topic: string, partition: number, offset: string): Promise<void> {
    if (!this.consumer) {
      this.logger.for(this.seek.name).error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    try {
      this.logger
        .for(this.seek.name)
        .info(
          'Seeking to offset | Topic: %s | Partition: %d | Offset: %s | ID: %s',
          topic,
          partition,
          offset,
          this.identifier,
        );
      this.consumer.seek({ topic, partition, offset });
      this.logger
        .for(this.seek.name)
        .info(
          'Successfully seeked to offset | Topic: %s | Partition: %d | Offset: %s | ID: %s',
          topic,
          partition,
          offset,
          this.identifier,
        );
    } catch (error) {
      this.logger
        .for(this.seek.name)
        .error(
          'Failed to seek | Topic: %s | Partition: %d | Offset: %s | Error: %s | ID: %s',
          topic,
          partition,
          offset,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Commit offsets manually (when autoCommit is false).
   */
  async commitOffsets(
    offsets: Array<{ topic: string; partition: number; offset: string }>,
  ): Promise<void> {
    if (!this.consumer) {
      this.logger
        .for(this.commitOffsets.name)
        .error('No consumer configured | ID: %s', this.identifier);
      throw getError({ message: 'No consumer configured' });
    }

    try {
      this.logger
        .for(this.commitOffsets.name)
        .info('Committing offsets | Offsets: %j | ID: %s', offsets, this.identifier);
      await this.consumer.commitOffsets(offsets);
      this.logger
        .for(this.commitOffsets.name)
        .info('Offsets committed successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.commitOffsets.name)
        .error('Failed to commit offsets | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  // TODO: [Deserialization] Add helper method
  // protected deserialize(value: Buffer | string | null): any {
  //   try {
  //     // Attempt JSON parse, fallback to string or raw buffer
  //   } catch (e) {
  //     // Handle parse error
  //   }
  // }

  /**
   * Get consumer instance for advanced operations.
   * Use with caution - direct access bypasses helper logging.
   */
  getConsumer(): Consumer {
    if (!this.consumer) {
      throw getError({ message: 'No consumer configured' });
    }
    return this.consumer;
  }
}
