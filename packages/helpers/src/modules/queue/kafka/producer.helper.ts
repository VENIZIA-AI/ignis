import { BaseHelper } from '@venizia/ignis-helpers';
import { Producer, stringSerializers } from '@platformatic/kafka';
import type { CompressionAlgorithmValue } from '@platformatic/kafka';
import type {
  IKafkaMessageOpts,
  IKafkaProducerOpts,
  TKafkaAcks,
  TKafkaMessageHeaders,
  TKafkaMessageKey,
  TKafkaMessageValue,
  TKafkaProducer,
} from './common/types';

/**
 * KafkaProducerHelper — Produce messages to Kafka topics with support for single and batch sends.
 *
 * @example
 * // Create a producer instance
 * const producer = KafkaProducerHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'nx-search-producer',
 *   identifier: 'search-producer',
 *   acks: -1, // Wait for all replicas
 *   idempotent: true,
 *   compression: 'GZIP',
 * });
 *
 * // Send a single message
 * await producer.sendMessages({
 *   topic: 'products-indexed',
 *   messages: [
 *     {
 *       key: 'product-123',
 *       value: JSON.stringify({ id: '123', name: 'Widget', price: 99.99 }),
 *       headers: { 'content-type': 'application/json' },
 *     },
 *   ],
 * });
 *
 * // Send multiple messages to different topics in batch
 * await producer.sendBatch([
 *   {
 *     topic: 'products-indexed',
 *     messages: [
 *       { key: 'p1', value: JSON.stringify({ id: '1', name: 'Widget' }) },
 *       { key: 'p2', value: JSON.stringify({ id: '2', name: 'Gadget' }) },
 *     ],
 *   },
 *   {
 *     topic: 'inventory-updated',
 *     messages: [
 *       { key: 'inv-1', value: JSON.stringify({ sku: 'SKU123', qty: 50 }) },
 *     ],
 *   },
 * ]);
 *
 * // Send with tombstone (null value for deletion)
 * await producer.sendMessages({
 *   topic: 'products-indexed',
 *   messages: [{ key: 'product-456', value: null }], // Tombstone
 * });
 *
 * // Clean up
 * await producer.close();
 */
export class KafkaProducerHelper extends BaseHelper {
  private readonly producer: TKafkaProducer;
  private readonly opts: IKafkaProducerOpts;

  constructor(opts: IKafkaProducerOpts) {
    super({
      scope: KafkaProducerHelper.name,
      identifier: opts.identifier ?? 'kafka-producer',
    });

    this.opts = opts;

    this.producer = new Producer({
      clientId: opts.clientId ?? 'nx-search-producer',
      bootstrapBrokers: opts.bootstrapBrokers,
      serializers: stringSerializers,
      strict: opts.strict ?? true,
      autocreateTopics: opts.autocreateTopics ?? false,
      compression: opts.compression,
      acks: opts.acks,
      idempotent: opts.idempotent,
      transactionalId: opts.transactionalId,
      retries: opts.retries ?? 3,
      retryDelay: opts.retryDelay ?? 1_000,
    });
  }

  static newInstance(opts: IKafkaProducerOpts): KafkaProducerHelper {
    return new KafkaProducerHelper(opts);
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /**
   * Send one or more messages to a single topic.
   * Messages can include keys for partitioning and headers for metadata.
   *
   * @example
   * await producer.sendMessages({
   *   topic: 'products-indexed',
   *   messages: [
   *     {
   *       key: 'product:123',
   *       value: JSON.stringify({ id: '123', name: 'Widget' }),
   *       headers: { 'source': 'search-service' },
   *     },
   *     {
   *       key: 'product:456',
   *       value: JSON.stringify({ id: '456', name: 'Gadget' }),
   *     },
   *   ],
   *   acks: -1, // Override for this send
   * });
   */
  async sendMessages(opts: {
    topic: string;
    messages: Array<IKafkaMessageOpts>;
    compression?: CompressionAlgorithmValue;
    acks?: TKafkaAcks;
  }): Promise<void> {
    const messages = opts.messages.map(m => ({
      topic: opts.topic,
      key: KafkaProducerHelper.toStringOrUndefined(m.key),
      // Cast to string | undefined: null is a valid tombstone sentinel at runtime
      // (AJV required check passes for null), but the Producer type only accepts string.
      value: KafkaProducerHelper.serializeValue(m.value) as unknown as string | undefined,
      headers: KafkaProducerHelper.toHeadersMap(m.headers),
    }));

    await this.producer.send({
      messages,
      compression: opts.compression ?? this.opts.compression,
      acks: opts.acks ?? this.opts.acks,
    });
  }

  /**
   * Send messages to multiple topics in a single batch operation.
   *
   * @example
   * await producer.sendBatch([
   *   {
   *     topic: 'products-indexed',
   *     messages: [
   *       { key: 'p1', value: JSON.stringify({ id: '1' }) },
   *       { key: 'p2', value: JSON.stringify({ id: '2' }) },
   *     ],
   *   },
   *   {
   *     topic: 'inventory-updated',
   *     messages: [
   *       { key: 'inv-1', value: JSON.stringify({ sku: 'SKU123', qty: 100 }) },
   *     ],
   *   },
   * ]);
   */
  async sendBatch(
    records: Array<{
      topic: string;
      messages: Array<IKafkaMessageOpts>;
    }>,
    opts?: { compression?: CompressionAlgorithmValue; acks?: TKafkaAcks },
  ): Promise<void> {
    const messages = records.flatMap(record =>
      record.messages.map(m => ({
        topic: record.topic,
        key: KafkaProducerHelper.toStringOrUndefined(m.key),
        // Cast to string | undefined: null is a valid tombstone sentinel at runtime
        // (AJV required check passes for null), but the Producer type only accepts string.
        value: KafkaProducerHelper.serializeValue(m.value) as unknown as string | undefined,
        headers: KafkaProducerHelper.toHeadersMap(m.headers),
      })),
    );

    await this.producer.send({
      messages,
      compression: opts?.compression ?? this.opts.compression,
      acks: opts?.acks ?? this.opts.acks,
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async close(isForce = false): Promise<void> {
    await Promise.resolve(this.producer.close(isForce));
    this.logger.info('Producer closed | Force: %s', isForce);
  }

  // ── Serialisation helpers ─────────────────────────────────────────────────

  private static serializeValue(value: TKafkaMessageValue): string | null | undefined {
    if (value === null) {
      // Return null so the @platformatic/kafka AJV strict validator sees the 'value'
      // property as present (required: ['value'] check passes). The producer's
      // stringSerializer converts null → undefined, producing a null wire tombstone.
      return null;
    }
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (Buffer.isBuffer(value)) {
      return value.toString();
    }
    return JSON.stringify(value);
  }

  private static toStringOrUndefined(key: TKafkaMessageKey): string | undefined {
    if (key == null) {
      return undefined;
    }
    if (Buffer.isBuffer(key)) {
      return key.toString();
    }
    return key;
  }

  private static toHeadersMap(headers?: TKafkaMessageHeaders): Map<string, string> | undefined {
    if (!headers) {
      return undefined;
    }
    if (headers instanceof Map) {
      return headers;
    }
    return new Map(Object.entries(headers));
  }
}
