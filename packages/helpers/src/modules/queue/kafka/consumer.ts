import type {
  ConsumerGroupJoinPayload,
  ConsumerGroupLeavePayload,
  ConsumerGroupRebalancePayload,
  ConsumerHeartbeatErrorPayload,
  Message,
  MessagesStream,
  Offsets,
} from '@platformatic/kafka';
import { Consumer } from '@platformatic/kafka';
import { BaseKafkaHelper } from './base';
import { KafkaClientEvents, KafkaDefaults, KafkaHealthStatuses } from './common/constants';
import type {
  IKafkaConsumeStartOptions,
  IKafkaConsumerOptions,
  TKafkaGroupJoinCallback,
  TKafkaGroupLeaveCallback,
  TKafkaMessageDoneCallback,
  TKafkaGroupRebalanceCallback,
  TKafkaHeartbeatErrorCallback,
  TKafkaLagCallback,
  TKafkaLagErrorCallback,
  TKafkaMessageCallback,
  TKafkaMessageErrorCallback,
} from './common/types';

/**
 * KafkaConsumerHelper — Wrapper around `@platformatic/kafka` Consumer.
 *
 * Provides scoped logging, lifecycle management, health tracking,
 * graceful shutdown, message callbacks, and lag monitoring.
 *
 * @example
 * const helper = KafkaConsumerHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'my-consumer',
 *   groupId: 'my-consumer-group',
 *   onMessage: async ({ message }) => {
 *     console.log('Received:', message.value);
 *     await message.commit();
 *   },
 *   onMessageError: ({ error }) => console.error('Error:', error),
 *   onGroupJoin: ({ groupId, memberId }) => console.log(`Joined ${groupId}`),
 * });
 *
 * await helper.start({ topics: ['my-topic'] });
 *
 * // Lag monitoring
 * helper.startLagMonitoring({ topics: ['my-topic'] });
 *
 * // Health check
 * helper.isHealthy(); // true when connected
 *
 * await helper.close();
 */
export class KafkaConsumerHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseKafkaHelper<Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>> {
  private stream: MessagesStream<KeyType, ValueType, HeaderKeyType, HeaderValueType> | null = null;
  private lagMonitoringActive = false;

  // Message callbacks
  private readonly onMessage?: TKafkaMessageCallback<
    KeyType,
    ValueType,
    HeaderKeyType,
    HeaderValueType
  >;
  private readonly onMessageDone?: TKafkaMessageDoneCallback<
    KeyType,
    ValueType,
    HeaderKeyType,
    HeaderValueType
  >;
  private readonly onMessageError?: TKafkaMessageErrorCallback<
    KeyType,
    ValueType,
    HeaderKeyType,
    HeaderValueType
  >;

  // Consumer group callbacks
  private readonly onGroupJoin?: TKafkaGroupJoinCallback;
  private readonly onGroupLeave?: TKafkaGroupLeaveCallback;
  private readonly onGroupRebalance?: TKafkaGroupRebalanceCallback;
  private readonly onHeartbeatError?: TKafkaHeartbeatErrorCallback;

  // Lag monitoring callbacks
  private readonly onLag?: TKafkaLagCallback;
  private readonly onLagError?: TKafkaLagErrorCallback;

  constructor(opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    super({
      scope: KafkaConsumerHelper.name,
      identifier: opts.identifier ?? 'kafka-consumer',
      shutdownTimeout: opts.shutdownTimeout,
      client: new Consumer({
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
        registry: opts.registry,
      }),
      onBrokerConnect: opts.onBrokerConnect,
      onBrokerDisconnect: opts.onBrokerDisconnect,
    });

    this.onMessage = opts.onMessage;
    this.onMessageDone = opts.onMessageDone;
    this.onMessageError = opts.onMessageError;
    this.onGroupJoin = opts.onGroupJoin;
    this.onGroupLeave = opts.onGroupLeave;
    this.onGroupRebalance = opts.onGroupRebalance;
    this.onHeartbeatError = opts.onHeartbeatError;
    this.onLag = opts.onLag;
    this.onLagError = opts.onLagError;

    this.configureBrokerEvents();

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
  >(opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    return new KafkaConsumerHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>(opts);
  }

  getConsumer(): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.client;
  }

  getStream(): MessagesStream<KeyType, ValueType, HeaderKeyType, HeaderValueType> | null {
    return this.stream;
  }

  override isReady(): boolean {
    return this.healthStatus === KafkaHealthStatuses.CONNECTED && this.client.isActive();
  }

  async start(opts: IKafkaConsumeStartOptions): Promise<void> {
    if (this.stream) {
      this.logger.warn('[start] Consumer already started, ignoring duplicate start call');
      return;
    }

    this.logger.info('[start] Starting consumer | Topics: %j', opts.topics);

    this.stream = await this.client.consume({
      topics: opts.topics,
      mode: opts.mode ?? KafkaDefaults.CONSUME_MODE,
      fallbackMode: opts.fallbackMode ?? KafkaDefaults.CONSUME_FALLBACK_MODE,
    });

    if (this.onMessage) {
      const messageHandler = this.onMessage;
      const doneHandler = this.onMessageDone;
      const errorHandler = this.onMessageError;

      this.stream.on(
        KafkaClientEvents.STREAM_DATA,
        (message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>) => {
          Promise.resolve(messageHandler({ message }))
            .then(() => doneHandler?.({ message }))
            .catch((error: unknown) => {
              const err = error instanceof Error ? error : new Error(String(error));
              this.logger.error('[start] Message processing error: %s', err.message);
              errorHandler?.({ error: err, message });
            });
        },
      );
    }

    if (this.onMessageError) {
      this.stream.on(KafkaClientEvents.STREAM_ERROR, (err: Error) => {
        this.onMessageError?.({ error: err });
      });
    }

    this.logger.info('[start] Consumer started | Topics: %j', opts.topics);
  }

  startLagMonitoring(opts: { topics: string[]; interval?: number }): void {
    if (this.lagMonitoringActive) {
      this.logger.warn(
        '[startLagMonitoring] Lag monitoring already active, ignoring duplicate call',
      );
      return;
    }

    const interval = opts.interval ?? KafkaDefaults.LAG_MONITOR_INTERVAL;
    this.client.startLagMonitoring({ topics: opts.topics }, interval);
    this.lagMonitoringActive = true;

    this.logger.info(
      '[startLagMonitoring] Lag monitoring STARTED | Topics: %j | Interval: %dms',
      opts.topics,
      interval,
    );
  }

  stopLagMonitoring(): void {
    if (!this.lagMonitoringActive) {
      return;
    }

    this.client.stopLagMonitoring();
    this.lagMonitoringActive = false;

    this.logger.info('[stopLagMonitoring] Lag monitoring STOPPED');
  }

  protected override closeClient(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client.close(true, (err?: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async close(opts?: { isForce?: boolean }): Promise<void> {
    const force = opts?.isForce ?? false;

    this.stopLagMonitoring();
    await this.closeStream();

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

    this.healthStatus = KafkaHealthStatuses.DISCONNECTED;
    this.logger.info('[close] Consumer closed | Force: %s', force);
  }

  private async closeStream(): Promise<void> {
    if (!this.stream) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      this.stream!.close((err?: Error | null) => {
        this.stream = null;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  protected override configureBrokerEvents(): void {
    super.configureBrokerEvents();

    this.client.on(KafkaClientEvents.CONSUMER_GROUP_JOIN, (payload: ConsumerGroupJoinPayload) => {
      this.logger.info(
        '[configureConsumerEvents] Group JOINED | GroupId: %s | MemberId: %s | GenerationId: %d',
        payload.groupId,
        payload.memberId,
        payload.generationId,
      );
      this.onGroupJoin?.({
        groupId: payload.groupId,
        memberId: payload.memberId,
        generationId: payload.generationId,
      });
    });

    this.client.on(KafkaClientEvents.CONSUMER_GROUP_LEAVE, (payload: ConsumerGroupLeavePayload) => {
      this.logger.info(
        '[configureConsumerEvents] Group LEFT | GroupId: %s | MemberId: %s',
        payload.groupId,
        payload.memberId,
      );
      this.onGroupLeave?.({
        groupId: payload.groupId,
        memberId: payload.memberId,
      });
    });

    this.client.on(
      KafkaClientEvents.CONSUMER_GROUP_REBALANCE,
      (payload: ConsumerGroupRebalancePayload) => {
        this.logger.info(
          '[configureConsumerEvents] Group REBALANCE | GroupId: %s',
          payload.groupId,
        );
        this.onGroupRebalance?.({ groupId: payload.groupId });
      },
    );

    this.client.on(
      KafkaClientEvents.CONSUMER_HEARTBEAT_ERROR,
      (payload: ConsumerHeartbeatErrorPayload) => {
        this.logger.error(
          '[configureConsumerEvents] Heartbeat ERROR | GroupId: %s | MemberId: %s | Error: %s',
          payload.groupId,
          payload.memberId,
          payload.error,
        );
        this.onHeartbeatError?.({
          error: payload.error,
          groupId: payload.groupId,
          memberId: payload.memberId,
        });
      },
    );

    this.client.on(KafkaClientEvents.CONSUMER_LAG, (lag: Offsets) => {
      this.onLag?.({ lag });
    });

    this.client.on(KafkaClientEvents.CONSUMER_LAG_ERROR, (error: Error) => {
      this.logger.error('[configureConsumerEvents] Lag monitoring ERROR: %s', error);
      this.onLagError?.({ error });
    });
  }
}
