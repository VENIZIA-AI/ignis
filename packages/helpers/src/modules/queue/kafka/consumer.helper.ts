import { BaseHelper } from '@venizia/ignis-helpers';
import {
  Consumer,
  MessagesStreamModes,
  MessagesStreamFallbackModes,
  stringDeserializers,
} from '@platformatic/kafka';
import {
  IBatchMessagesOpts,
  IConsumeOpts,
  IEachMessageOpts,
  IKafkaConsumedMessage,
  IKafkaConsumerOpts,
  KafkaConsumeMode,
  TKafkaConsumeMode,
  TKafkaConsumer,
  TKafkaMessage,
  TKafkaStream,
} from './common/types';

const DEFAULT_IDENTIFIER = 'kafka-consumer';
const DEFAULT_CLIENT_ID = 'consumer';

/**
 * KafkaConsumerHelper — Consume messages from Kafka topics with support for each-message and batch-message modes.
 *
 * @example
 * // Create a consumer instance
 * const consumer = KafkaConsumerHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   groupId: 'my-consumer-group',
 *   identifier: 'search-consumer',
 *   autocommit: false,
 * });
 *
 * // Consume messages one-by-one with auto-commit
 * const abortCtrl = new AbortController();
 * await consumer.eachMessage(
 *   ['products-topic', 'inventory-topic'],
 *   async (message) => {
 *     console.log('Received:', message.topic, message.value?.toString());
 *     await message.commit(); // Manual commit after processing
 *   },
 *   { abortSignal: abortCtrl.signal, fromBeginning: false }
 * );
 *
 * // Consume messages in batches for bulk processing
 * await consumer.batchMessages(
 *   ['products-topic'],
 *   async (batch) => {
 *     console.log(`Processing batch of ${batch.length} messages`);
 *     // Process all messages in the batch
 *     for (const msg of batch) {
 *       await message.commit();
 *     }
 *   },
 *   { batchSize: 20, batchTimeMs: 5000, fromBeginning: false }
 * );
 *
 * // Clean up
 * await consumer.close();
 */
export class KafkaConsumerHelper extends BaseHelper {
  private readonly consumer: TKafkaConsumer;
  private readonly consumerOpts: IKafkaConsumerOpts;

  private state: TKafkaConsumeMode = KafkaConsumeMode.NONE;

  constructor(opts: IKafkaConsumerOpts) {
    super({
      scope: KafkaConsumerHelper.name,
      identifier: opts.identifier ?? DEFAULT_IDENTIFIER,
    });

    this.consumerOpts = opts;

    this.consumer = new Consumer({
      clientId: opts.clientId ?? DEFAULT_CLIENT_ID,
      bootstrapBrokers: opts.bootstrapBrokers,
      groupId: opts.groupId,
      groupInstanceId: opts.groupInstanceId,
      groupProtocol: opts.groupProtocol ?? 'classic',
      deserializers: stringDeserializers,
      autocommit: opts.autocommit ?? false,
      sessionTimeout: opts.sessionTimeout ?? 30_000,
      heartbeatInterval: opts.heartbeatInterval ?? 3_000,
      rebalanceTimeout: opts.rebalanceTimeout ?? opts.sessionTimeout ?? 30_000,
      highWaterMark: opts.highWaterMark ?? 1024,
      minBytes: opts.minBytes ?? 1,
      maxBytes: opts.maxBytes,
      maxWaitTime: opts.maxWaitTime,
      metadataMaxAge: opts.metadataMaxAge ?? 300_000,
      retries: opts.retries ?? 3,
      retryDelay: opts.retryDelay ?? 1_000,
    });
  }

  static newInstance(opts: IKafkaConsumerOpts): KafkaConsumerHelper {
    return new KafkaConsumerHelper(opts);
  }

  /**
   * Consume messages one-by-one from topics with automatic reconnection.
   * Each message must be explicitly committed after processing (if autocommit=false).
   *
   * @example
   * const abortCtrl = new AbortController();
   * await consumer.eachMessage(
   *   ['products-topic'],
   *   async (msg) => {
   *     const data = JSON.parse(msg.value?.toString() ?? '{}');
   *     console.log('Processing:', data);
   *     await msg.commit(); // Commit after successful processing
   *   },
   *   { abortSignal: abortCtrl.signal, reconnectDelayMs: 3000 }
   * );
   *
   * // To stop consuming: abortCtrl.abort();
   */
  async eachMessage(
    topics: string[],
    handler: (message: IKafkaConsumedMessage) => Promise<void>,
    opts: IEachMessageOpts = {},
  ): Promise<void> {
    this.assertIdle(KafkaConsumeMode.EACH_MESSAGE);
    this.state = KafkaConsumeMode.EACH_MESSAGE;

    const { abortSignal, reconnectDelayMs = 2_000, fromBeginning: isFromBeginning = false } = opts;

    this.logger.info(
      'eachMessage started | Topics: %j | GroupId: %s',
      topics,
      this.consumerOpts.groupId,
    );

    try {
      while (!abortSignal?.aborted) {
        try {
          const stream = await this.openStream(topics, isFromBeginning);
          const generator = KafkaConsumerHelper.streamToAsyncGenerator(stream);

          for await (const msg of generator) {
            if (abortSignal?.aborted) {
              stream.destroy();
              break;
            }

            await handler(msg);
          }
        } catch (err) {
          if (abortSignal?.aborted) {
            break;
          }

          this.logger.error(
            'eachMessage stream error — reconnecting in %dms | Error: %s',
            reconnectDelayMs,
            err,
          );

          await KafkaConsumerHelper.sleep(reconnectDelayMs);
        }
      }
    } finally {
      this.state = KafkaConsumeMode.NONE;
      this.logger.info('eachMessage stopped | Topics: %j', topics);
    }
  }

  /**
   * Consume messages in batches for more efficient bulk processing.
   * Batches are flushed either when batchSize is reached or batchTimeMs expires.
   *
   * @example
   * await consumer.batchMessages(
   *   ['products-topic'],
   *   async (batch) => {
   *     console.log(`Processing ${batch.length} messages`);
   *     const records = batch.map(msg => JSON.parse(msg.value?.toString() ?? '{}'));
   *     await db.insertMany('search_documents', records);
   *     // Commit all messages in the batch
   *     await Promise.all(batch.map(msg => msg.commit()));
   *   },
   *   { batchSize: 50, batchTimeMs: 10000 }
   * );
   */
  async batchMessages(
    topics: string[],
    handler: (batch: IKafkaConsumedMessage[]) => Promise<void>,
    opts: IBatchMessagesOpts = {},
  ): Promise<void> {
    this.assertIdle(KafkaConsumeMode.BATCH_MESSAGES);
    this.state = KafkaConsumeMode.BATCH_MESSAGES;

    const {
      abortSignal,
      reconnectDelayMs = 2_000,
      fromBeginning: isFromBeginning = false,
      batchSize = 10,
      batchTimeMs = 1_000,
    } = opts;

    this.logger.info(
      'batchMessages started | Topics: %j | GroupId: %s | BatchSize: %d | BatchTimeMs: %d',
      topics,
      this.consumerOpts.groupId,
      batchSize,
      batchTimeMs,
    );

    try {
      while (!abortSignal?.aborted) {
        try {
          const stream = await this.openStream(topics, isFromBeginning);
          const generator = KafkaConsumerHelper.streamToAsyncGenerator(stream);

          let batch: IKafkaConsumedMessage[] = [];
          let batchOpenedAt = 0;

          const flush = async (): Promise<void> => {
            if (batch.length === 0) {
              return;
            }
            const toFlush = batch;
            batch = [];
            batchOpenedAt = 0;
            await handler(toFlush);
          };

          for await (const msg of generator) {
            if (abortSignal?.aborted) {
              stream.destroy();
              break;
            }

            if (batch.length === 0) {
              batchOpenedAt = Date.now();
            }

            batch.push(msg);

            const isSizeReached = batch.length >= batchSize;
            const isTimeExpired = Date.now() - batchOpenedAt >= batchTimeMs;

            if (isSizeReached || isTimeExpired) {
              await flush();
            }
          }

          await flush();
        } catch (err) {
          if (abortSignal?.aborted) {
            break;
          }

          this.logger.error(
            'batchMessages stream error — reconnecting in %dms | Error: %s',
            reconnectDelayMs,
            err,
          );

          await KafkaConsumerHelper.sleep(reconnectDelayMs);
        }
      }
    } finally {
      this.state = KafkaConsumeMode.NONE;
      this.logger.info('batchMessages stopped | Topics: %j', topics);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async close(isForce = true): Promise<void> {
    await Promise.resolve(this.consumer.close(isForce));
    this.logger.info('Consumer closed | Force: %s', isForce);
  }

  async commit(
    offsets: Array<{ topic: string; partition: number; offset: bigint }>,
  ): Promise<void> {
    await this.consumer.commit({
      offsets: offsets.map(o => ({
        topic: o.topic,
        partition: o.partition,
        offset: o.offset,
        leaderEpoch: 0,
      })),
    });
  }

  // ── Core stream opener ────────────────────────────────────────────────────

  async consume(
    topics: string[],
    opts?: IConsumeOpts,
  ): Promise<AsyncGenerator<IKafkaConsumedMessage>> {
    const fallbackMode =
      opts?.fromBeginning === true
        ? MessagesStreamFallbackModes.EARLIEST
        : MessagesStreamFallbackModes.LATEST;

    const stream = await this.openStream(
      topics,
      opts?.fromBeginning ?? false,
      opts?.maxFetches,
      opts?.alwaysFromEarliest ?? false,
    );

    this.logger.info(
      'Stream opened | Topics: %j | GroupId: %s | FallbackMode: %s',
      topics,
      this.consumerOpts.groupId,
      fallbackMode,
    );

    return KafkaConsumerHelper.streamToAsyncGenerator(stream);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async openStream(
    topics: string[],
    fromBeginning: boolean,
    maxFetches = 0,
    alwaysFromEarliest = false,
  ): Promise<TKafkaStream> {
    const stream = await this.consumer.consume({
      topics,
      // Use EARLIEST directly for ephemeral consumers that always replay from offset 0.
      // COMMITTED + fallback causes @platformatic/kafka to run the full group-offset
      // lifecycle (OffsetFetch → re-join cycles) which races against in-flight Fetch
      // requests on empty topics, producing ILLEGAL_GENERATION errors.
      mode: alwaysFromEarliest ? MessagesStreamModes.EARLIEST : MessagesStreamModes.COMMITTED,
      fallbackMode: fromBeginning
        ? MessagesStreamFallbackModes.EARLIEST
        : MessagesStreamFallbackModes.LATEST,
      autocommit: this.consumerOpts.autocommit ?? false,
      maxFetches,
    });

    const kick = (): void => {
      if (!stream.destroyed) {
        stream.resume();
      }
    };

    setImmediate(kick);
    stream.consumer.on('consumer:group:join', kick);

    return stream;
  }

  private assertIdle(method: string): void {
    if (this.state !== KafkaConsumeMode.NONE) {
      throw new Error(
        `KafkaConsumerHelper: cannot start ${method}() — ${this.state}() is already active. ` +
          'Create a separate KafkaConsumerHelper instance per concurrent consumer.',
      );
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static streamToAsyncGenerator(
    stream: TKafkaStream,
  ): AsyncGenerator<IKafkaConsumedMessage> {
    const buffer: TKafkaMessage[] = [];
    let isEnded = false;
    let streamError: Error | null = null;
    let notify: (() => void) | null = null;

    const wake = (): void => {
      const fn = notify;
      notify = null;
      fn?.();
    };

    stream.on('data', (msg: TKafkaMessage) => {
      buffer.push(msg);
      wake();
    });
    stream.on('end', () => {
      isEnded = true;
      wake();
    });
    stream.on('error', (err: Error) => {
      streamError = err;
      wake();
    });

    const kick = (): void => {
      if (!stream.destroyed) {
        stream.resume();
      }
    };
    setImmediate(kick);
    stream.consumer.on('consumer:group:join', kick);

    return (async function* () {
      while (true) {
        if (buffer.length > 0) {
          yield KafkaConsumerHelper.adaptMessage(buffer.shift()!);
          continue;
        }

        if (streamError) {
          throw streamError;
        }
        if (isEnded) {
          return;
        }

        await new Promise<void>(resolve => {
          notify = resolve;
        });
      }
    })();
  }

  private static adaptMessage(msg: TKafkaMessage): IKafkaConsumedMessage {
    const key = msg.key != null ? Buffer.from(msg.key) : null;
    const value = msg.value != null ? Buffer.from(msg.value) : null;

    return {
      topic: msg.topic,
      partition: msg.partition,
      key,
      value,
      offset: msg.offset,
      timestamp: msg.timestamp,
      headers: msg.headers,
      commit: async (callback?: (error?: Error) => void) => {
        try {
          const result = msg.commit();
          if (result instanceof Promise) {
            await result;
          }
          callback?.();
        } catch (err) {
          callback?.(err instanceof Error ? err : new Error(String(err)));
        }
      },
    };
  }
}
