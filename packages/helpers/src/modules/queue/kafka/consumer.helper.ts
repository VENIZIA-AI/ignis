import { type ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { Consumer, type MessagesStream } from '@platformatic/kafka';
import { KafkaDefaults } from './common';
import {
  type IKafkaCommitOptions,
  type IKafkaConsumedMessage,
  type IKafkaConsumerOptions,
} from './common/types';

export class KafkaConsumerHelper<
  Key = unknown,
  Value = unknown,
  HeaderKey = unknown,
  HeaderValue = unknown,
> extends BaseHelper {
  private consumer: Consumer<Key, Value, HeaderKey, HeaderValue>;
  private stream: MessagesStream<Key, Value, HeaderKey, HeaderValue> | null = null;
  private topics: string[];
  private consuming = false;
  private abortController: AbortController;

  private autocommit?: boolean | number;
  private sessionTimeout?: number;
  private heartbeatInterval?: number;
  private highWaterMark?: number;
  private maxWaitTime?: number;
  private mode?: 'latest' | 'earliest' | 'committed';

  private onMessage?: (opts: { message: IKafkaConsumedMessage }) => ValueOrPromise<void>;
  private onError?: (opts: { error: Error }) => void;

  constructor(opts: IKafkaConsumerOptions<Key, Value, HeaderKey, HeaderValue>) {
    super({ scope: KafkaConsumerHelper.name, identifier: opts.identifier });

    this.topics = opts.topics;
    this.autocommit = opts.autocommit;
    this.sessionTimeout = opts.sessionTimeout;
    this.heartbeatInterval = opts.heartbeatInterval;
    this.highWaterMark = opts.highWaterMark;
    this.maxWaitTime = opts.maxWaitTime;
    this.mode = opts.mode;
    this.onMessage = opts.onMessage;
    this.onError = opts.onError;
    this.abortController = new AbortController();

    this.consumer = new Consumer<Key, Value, HeaderKey, HeaderValue>({
      clientId: opts.clientId ?? KafkaDefaults.CLIENT_ID,
      bootstrapBrokers: opts.bootstrapBrokers,
      timeout: opts.timeout,
      retries: opts.retries,
      retryDelay: opts.retryDelay,
      groupId: opts.groupId,
      sessionTimeout: opts.sessionTimeout ?? KafkaDefaults.SESSION_TIMEOUT,
      heartbeatInterval: opts.heartbeatInterval ?? KafkaDefaults.HEARTBEAT_INTERVAL,
      highWaterMark: opts.highWaterMark ?? KafkaDefaults.HIGH_WATER_MARK,
      maxWaitTime: opts.maxWaitTime ?? KafkaDefaults.MAX_WAIT_TIME,
      autocommit: opts.autocommit ?? true,
      ...(opts.deserializers ? { deserializers: opts.deserializers } : {}),
    });

    this.wireLifecycleHooks(opts);
    this.logger.for('constructor').info('Consumer initialized | ID: %s', this.identifier);
  }

  private wireLifecycleHooks(
    opts: IKafkaConsumerOptions<Key, Value, HeaderKey, HeaderValue>,
  ): void {
    if (opts.onConnected) {
      this.consumer.on('client:broker:connect', () => {
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
      this.consumer.on('client:broker:disconnect', () => {
        try {
          opts.onDisconnected!();
        } catch (err) {
          this.logger
            .for('onDisconnected')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }

    if (opts.onGroupJoin) {
      this.consumer.on('consumer:group:join', payload => {
        try {
          opts.onGroupJoin!({ groupId: payload.groupId, memberId: payload.memberId });
        } catch (err) {
          this.logger
            .for('onGroupJoin')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }

    if (opts.onGroupLeave) {
      this.consumer.on('consumer:group:leave', () => {
        try {
          opts.onGroupLeave!();
        } catch (err) {
          this.logger
            .for('onGroupLeave')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }

    if (opts.onRebalance) {
      this.consumer.on('consumer:group:rebalance', () => {
        try {
          opts.onRebalance!();
        } catch (err) {
          this.logger
            .for('onRebalance')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }

    if (opts.onLag) {
      this.consumer.on('consumer:lag', offsets => {
        try {
          opts.onLag!({ offsets });
        } catch (err) {
          this.logger.for('onLag').error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }
  }

  static newInstance<K = unknown, V = unknown, HK = unknown, HV = unknown>(
    opts: IKafkaConsumerOptions<K, V, HK, HV>,
  ) {
    return new KafkaConsumerHelper<K, V, HK, HV>(opts);
  }

  async start(): Promise<void> {
    if (this.consuming) {
      this.logger.for(this.start.name).warn('Consumer already running | ID: %s', this.identifier);
      return;
    }

    this.stream = await this.consumer.consume({
      topics: this.topics,
      autocommit: this.autocommit ?? true,
      sessionTimeout: this.sessionTimeout ?? KafkaDefaults.SESSION_TIMEOUT,
      heartbeatInterval: this.heartbeatInterval ?? KafkaDefaults.HEARTBEAT_INTERVAL,
      highWaterMark: this.highWaterMark ?? KafkaDefaults.HIGH_WATER_MARK,
      maxWaitTime: this.maxWaitTime ?? KafkaDefaults.MAX_WAIT_TIME,
      mode: this.mode ?? 'latest',
    });

    this.consuming = true;
    this.logger
      .for(this.start.name)
      .info('Consumer started | Topics: %j | ID: %s', this.topics, this.identifier);

    // eslint-disable-next-line no-void
    void this.consumeLoop();
  }

  private async consumeLoop(): Promise<void> {
    if (!this.stream) {
      return;
    }

    try {
      for await (const message of this.stream) {
        if (this.abortController.signal.aborted) {
          break;
        }

        try {
          await this.onMessage?.({ message: message as IKafkaConsumedMessage });
        } catch (err) {
          this.logger
            .for('consumeLoop')
            .error('Error processing message: %s | ID: %s', err, this.identifier);
          this.onError?.({ error: err as Error });
        }
      }
    } catch (err) {
      if (!this.abortController.signal.aborted) {
        this.logger.for('consumeLoop').error('Stream error: %s | ID: %s', err, this.identifier);
        this.onError?.({ error: err as Error });
      }
    } finally {
      this.consuming = false;
    }
  }

  isConsuming(): boolean {
    return this.consuming;
  }

  pause(): void {
    this.stream?.pause();
    this.logger.for(this.pause.name).debug('Stream paused | ID: %s', this.identifier);
  }

  resume(): void {
    this.stream?.resume();
    this.logger.for(this.resume.name).debug('Stream resumed | ID: %s', this.identifier);
  }

  isPaused(): boolean {
    return this.stream?.isPaused() ?? false;
  }

  async commit(opts: IKafkaCommitOptions): Promise<void> {
    await this.consumer.commit({ offsets: opts.offsets });
    this.logger.for(this.commit.name).debug('Offsets committed | ID: %s', this.identifier);
  }

  startLagMonitoring(opts: { interval: number }): void {
    this.consumer.startLagMonitoring({ topics: this.topics }, opts.interval);
    this.logger
      .for(this.startLagMonitoring.name)
      .info('Lag monitoring started (interval: %dms) | ID: %s', opts.interval, this.identifier);
  }

  stopLagMonitoring(): void {
    this.consumer.stopLagMonitoring();
    this.logger
      .for(this.stopLagMonitoring.name)
      .info('Lag monitoring stopped | ID: %s', this.identifier);
  }

  getConsumer(): Consumer<Key, Value, HeaderKey, HeaderValue> {
    return this.consumer;
  }

  async close(): Promise<void> {
    try {
      this.abortController.abort();
      await this.stream?.close();
      await this.consumer?.close();
      this.consuming = false;
      this.logger
        .for(this.close.name)
        .info('Consumer closed successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing consumer: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }
}
