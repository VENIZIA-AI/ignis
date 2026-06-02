import { getError } from '@/modules/error';
import { sleep } from '@/utilities/date.utility';
import { toError } from '@/utilities/promise.utility';
import type {
  ConsumerGroupJoinPayload,
  ConsumerGroupLeavePayload,
  ConsumerGroupRebalancePayload,
  ConsumerHeartbeatErrorPayload,
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
  TKafkaGroupRebalanceCallback,
  TKafkaHeartbeatErrorCallback,
  TKafkaLagCallback,
  TKafkaLagErrorCallback,
  TKafkaMessageCallback,
  TKafkaMessageDoneCallback,
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
  private consumeLoop: Promise<void> | null = null;
  private consumeStartOptions: IKafkaConsumeStartOptions | null = null;
  private lagMonitoringActive = false;
  private lagMonitoringOptions: { topics: string[]; interval?: number } | null = null;
  private sessionLikelyStale = false;

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

  private readonly initialOptions: IKafkaConsumerOptions<
    KeyType,
    ValueType,
    HeaderKeyType,
    HeaderValueType
  >;

  constructor(opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) {
    super({
      scope: KafkaConsumerHelper.name,
      identifier: opts.identifier ?? 'kafka-consumer',
      shutdownTimeout: opts.shutdownTimeout,
      client: KafkaConsumerHelper.buildConsumerClient(opts),
      onBrokerConnect: opts.onBrokerConnect,
      onBrokerDisconnect: opts.onBrokerDisconnect,
    });

    this.initialOptions = opts;
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

  private static buildConsumerClient<
    KeyType = string,
    ValueType = string,
    HeaderKeyType = string,
    HeaderValueType = string,
  >(
    opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
  ): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return new Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>({
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
      maxBytes: opts.maxBytes ?? KafkaDefaults.MAX_BYTES,
      maxWaitTime: opts.maxWaitTime ?? KafkaDefaults.MAX_WAIT_TIME,
      metadataMaxAge: opts.metadataMaxAge ?? KafkaDefaults.METADATA_MAX_AGE,
      retries: opts.retries ?? KafkaDefaults.RETRIES,
      retryDelay: opts.retryDelay ?? KafkaDefaults.RETRY_DELAY,
      registry: opts.registry,
    });
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

    this.consumeStartOptions = opts;
    this.stream = await this.client.consume({
      topics: opts.topics,
      mode: opts.mode ?? KafkaDefaults.CONSUME_MODE,
      fallbackMode: opts.fallbackMode ?? KafkaDefaults.CONSUME_FALLBACK_MODE,
    });

    // Successful consume() means we're freshly joined to the group; clear any
    // stale-session flag that might have been set during initial broker
    // negotiation (e.g. transient BROKER_DISCONNECT during bootstrap).
    this.sessionLikelyStale = false;

    if (this.onMessageError) {
      this.stream.on(KafkaClientEvents.STREAM_ERROR, (err: Error) => {
        this.onMessageError?.({ error: err });
      });
    }

    if (this.onMessage) {
      this.consumeLoop = this.startConsumeLoop({
        messageHandler: this.onMessage,
        doneHandler: this.onMessageDone,
        errorHandler: this.onMessageError,
        reconnectDelayMs: opts.reconnectDelayMs ?? KafkaDefaults.RECONNECT_DELAY,
        maxReconnectAttempts: opts.maxReconnectAttempts ?? KafkaDefaults.MAX_RECONNECT_ATTEMPTS,
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
    this.lagMonitoringOptions = { topics: opts.topics, interval };

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
    this.lagMonitoringOptions = null;

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
      } catch (error) {
        this.logger.warn('[close] Graceful shutdown timed out, forcing close | Error: %s', error);
        await this.closeClient();
      }
    }

    this.resetHealthState();
    this.logger.info('[close] Consumer closed | Force: %s', force);
  }

  private async startConsumeLoop(opts: {
    messageHandler: TKafkaMessageCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    doneHandler?: TKafkaMessageDoneCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
  }): Promise<void> {
    const { messageHandler, doneHandler, errorHandler, reconnectDelayMs, maxReconnectAttempts } =
      opts;

    for await (const message of this.consumeMessages({
      reconnectDelayMs,
      maxReconnectAttempts,
      errorHandler,
    })) {
      try {
        await messageHandler({ message });
        await doneHandler?.({ message });
      } catch (error) {
        const err = toError(error);
        this.logger.error('[startConsumeLoop] Message processing error: %s', err.message);
        errorHandler?.({ error: err, message });
      }
    }
  }

  private async *consumeMessages(opts: {
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
    errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  }) {
    const { reconnectDelayMs, maxReconnectAttempts, errorHandler } = opts;
    let consecutiveErrors = 0;

    while (true) {
      if (this.stream) {
        yield* this.drainStream({ errorHandler });
      }

      if (!this.consumeStartOptions) {
        this.logger.info('[consumeMessages] Shutdown requested, exiting consume loop');
        return;
      }

      consecutiveErrors++;
      if (consecutiveErrors > maxReconnectAttempts) {
        this.logger.error(
          '[consumeMessages] All %d reconnect attempts exhausted | Topics: %j',
          maxReconnectAttempts,
          this.consumeStartOptions?.topics,
        );
        return;
      }

      await this.attemptReconnect({
        attempt: consecutiveErrors,
        maxAttempts: maxReconnectAttempts,
        delayMs: reconnectDelayMs,
        errorHandler,
      });

      if (!this.consumeStartOptions) {
        this.logger.info(
          '[consumeMessages] Shutdown requested during reconnect, exiting consume loop',
        );
        return;
      }

      if (this.stream) {
        consecutiveErrors = 0;
      }
    }
  }

  private async *drainStream(opts: {
    errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  }) {
    this.logger.debug('[drainStream] Consuming | Topics: %j', this.consumeStartOptions?.topics);

    try {
      yield* this.stream!;
      this.logger.warn(
        '[drainStream] Stream ended normally | Topics: %j',
        this.consumeStartOptions?.topics,
      );
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        '[drainStream] Stream error: %s | Topics: %j',
        err.message,
        this.consumeStartOptions?.topics,
      );
      opts.errorHandler?.({ error: err });
    }

    this.destroyDeadStream();
  }

  private async attemptReconnect(opts: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  }): Promise<void> {
    const { attempt, maxAttempts, delayMs, errorHandler } = opts;

    this.logger.info(
      '[attemptReconnect] Reconnecting %d/%d in %dms | Topics: %j | ConnectedBrokers: %d',
      attempt,
      maxAttempts,
      delayMs,
      this.consumeStartOptions?.topics,
      this.getConnectedBrokerCount(),
    );
    await sleep(delayMs);

    if (!this.consumeStartOptions) {
      return;
    }

    const shouldRebuildClient = this.sessionLikelyStale;

    if (shouldRebuildClient) {
      this.logger.warn(
        '[attemptReconnect] Session stale flag is set, will rebuild client | Attempt: %d',
        attempt,
      );
    }

    if (shouldRebuildClient) {
      try {
        await this.rebuildClient();
        this.sessionLikelyStale = false;
      } catch (error) {
        const err = toError(error);
        this.logger.error(
          '[attemptReconnect] Client rebuild failed (%d/%d): %s | Topics: %j',
          attempt,
          maxAttempts,
          err.message,
          this.consumeStartOptions?.topics,
        );
        errorHandler?.({ error: err });
        return;
      }
    }

    try {
      this.stream = await this.client.consume({
        topics: this.consumeStartOptions.topics,
        mode: this.consumeStartOptions.mode ?? KafkaDefaults.CONSUME_MODE,
        fallbackMode: this.consumeStartOptions.fallbackMode ?? KafkaDefaults.CONSUME_FALLBACK_MODE,
      });

      if (this.onMessageError) {
        this.stream.on(KafkaClientEvents.STREAM_ERROR, (err: Error) => {
          this.onMessageError?.({ error: err });
        });
      }

      this.sessionLikelyStale = false;

      this.logger.info(
        '[attemptReconnect] Reconnected successfully | Topics: %j | Attempt: %d | Rebuilt: %s',
        this.consumeStartOptions.topics,
        attempt,
        shouldRebuildClient,
      );
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        '[attemptReconnect] Failed (%d/%d): %s | Topics: %j | ConnectedBrokers: %d',
        attempt,
        maxAttempts,
        err.message,
        this.consumeStartOptions?.topics,
        this.getConnectedBrokerCount(),
      );
      errorHandler?.({ error: err });
    }
  }

  private async rebuildClient(): Promise<void> {
    this.logger.warn(
      '[rebuildClient] All brokers were disconnected; rebuilding @platformatic/kafka ' +
        'Consumer to force a clean group rejoin (cached session state is stale)',
    );

    const oldClient = this.client;
    const newClient = KafkaConsumerHelper.buildConsumerClient(this.initialOptions);

    this.swapClient(newClient);

    if (this.lagMonitoringOptions) {
      const opts = this.lagMonitoringOptions;
      this.lagMonitoringActive = false; // reset so startLagMonitoring won't refuse
      try {
        this.startLagMonitoring(opts);
        this.logger.info(
          '[rebuildClient] Lag monitoring re-armed on new client | Topics: %j',
          opts.topics,
        );
      } catch (error) {
        this.logger.warn(
          '[rebuildClient] Failed to restart lag monitoring on new client | Error: %s',
          toError(error).message,
        );
      }
    }

    this.closeOldClient(oldClient).catch(error => {
      this.logger.warn(
        '[rebuildClient] background close of old client failed (ignored) | Error: %s',
        toError(error).message,
      );
    });
  }

  private async closeOldClient(
    oldClient: Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
  ): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          oldClient.close(true, (err?: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }),
        new Promise<void>(resolve => {
          timeoutHandle = setTimeout(resolve, this.shutdownTimeout);
        }),
      ]);
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private handleAllBrokersDown(reason: 'disconnected' | 'failed'): void {
    if (this.getConnectedBrokerCount() !== 0) {
      return;
    }
    this.sessionLikelyStale = true;
    if (this.stream) {
      this.logger.warn(
        '[configureBrokerEvents] All brokers %s, destroying stream to trigger reconnect',
        reason,
      );
      this.destroyDeadStream();
    }
  }

  private destroyDeadStream(): void {
    this.stream?.destroy(getError({ message: '[destroyDeadStream] All brokers disconnected' }));
    this.stream = null;
  }

  private async closeStream(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    this.consumeStartOptions = null;

    try {
      await stream?.close();
    } catch (error) {
      this.logger.warn('[closeStream] Error closing stream: %s', toError(error).message);
    }

    await this.consumeLoop;
    this.consumeLoop = null;
  }

  protected override unconfigureBrokerEvents(): void {
    super.unconfigureBrokerEvents();
    this.client.removeAllListeners(KafkaClientEvents.CONSUMER_GROUP_JOIN);
    this.client.removeAllListeners(KafkaClientEvents.CONSUMER_GROUP_LEAVE);
    this.client.removeAllListeners(KafkaClientEvents.CONSUMER_GROUP_REBALANCE);
    this.client.removeAllListeners(KafkaClientEvents.CONSUMER_HEARTBEAT_ERROR);
    this.client.removeAllListeners(KafkaClientEvents.CONSUMER_LAG);
    this.client.removeAllListeners(KafkaClientEvents.CONSUMER_LAG_ERROR);
  }

  protected override configureBrokerEvents(): void {
    super.configureBrokerEvents();

    this.client.on(KafkaClientEvents.BROKER_DISCONNECT, () => {
      this.handleAllBrokersDown('disconnected');
    });
    this.client.on(KafkaClientEvents.BROKER_FAILED, () => {
      this.handleAllBrokersDown('failed');
    });

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
