import { type TConstValue } from '@/common';

/** Consumer group protocol: `classic` or `consumer`. */
export class KafkaGroupProtocol {
  static readonly CLASSIC = 'classic';
  static readonly CONSUMER = 'consumer';

  static readonly SCHEME_SET = new Set([this.CLASSIC, this.CONSUMER]);

  static isValid(mode: string): boolean {
    return this.SCHEME_SET.has(mode);
  }
}

/** A {@link KafkaGroupProtocol} value. */
export type TKafkaGroupProtocol = TConstValue<typeof KafkaGroupProtocol>;

/** Producer acknowledgment level, as the Kafka `acks` number: `0` none, `1` leader, `-1` all in-sync replicas. */
export class KafkaAcks {
  static readonly NONE = 0; // No acknowledgment — fire-and-forget
  static readonly LEADER = 1; // Leader acknowledgment only
  static readonly ALL = -1; // Full ISR acknowledgment

  static readonly SCHEME_SET = new Set([this.NONE, this.LEADER, this.ALL]);

  static isValid(ack: number): boolean {
    return this.SCHEME_SET.has(ack);
  }
}

/** A {@link KafkaAcks} value. */
export type TKafkaAcks = TConstValue<typeof KafkaAcks>;

/** Connection health of a Kafka helper, as reported by `getHealthStatus()`. */
export class KafkaHealthStatuses {
  static readonly CONNECTED = 'connected';
  static readonly DISCONNECTED = 'disconnected';
  static readonly UNKNOWN = 'unknown';

  static readonly SCHEME_SET = new Set([this.CONNECTED, this.DISCONNECTED, this.UNKNOWN]);

  static isValid(status: string): boolean {
    return this.SCHEME_SET.has(status);
  }
}

/** A {@link KafkaHealthStatuses} value. */
export type TKafkaHealthStatus = TConstValue<typeof KafkaHealthStatuses>;

/** Names of the `@platformatic/kafka` client, consumer-group and stream events the helpers listen to. */
export class KafkaClientEvents {
  static readonly BROKER_CONNECT = 'client:broker:connect';
  static readonly BROKER_DISCONNECT = 'client:broker:disconnect';
  static readonly BROKER_FAILED = 'client:broker:failed';

  static readonly CONSUMER_GROUP_JOIN = 'consumer:group:join';
  static readonly CONSUMER_GROUP_LEAVE = 'consumer:group:leave';
  static readonly CONSUMER_GROUP_REBALANCE = 'consumer:group:rebalance';
  static readonly CONSUMER_HEARTBEAT_ERROR = 'consumer:heartbeat:error';
  static readonly CONSUMER_LAG = 'consumer:lag';
  static readonly CONSUMER_LAG_ERROR = 'consumer:lag:error';

  static readonly STREAM_DATA = 'data';
  static readonly STREAM_ERROR = 'error';
}

/** The option values the Kafka helpers use for a field the caller leaves unset. Timeouts, delays and intervals are in milliseconds; `MAX_BYTES` is in bytes. */
export class KafkaDefaults {
  // Shared
  static readonly RETRIES = 3;
  static readonly RETRY_DELAY = 1_000;

  // Producer
  static readonly STRICT = true;
  static readonly AUTOCREATE_TOPICS = false;

  // Consumer
  static readonly AUTOCOMMIT = false;
  static readonly SESSION_TIMEOUT = 60_000;
  static readonly HEARTBEAT_INTERVAL = 10_000;
  static readonly HIGH_WATER_MARK = 1024;
  static readonly MIN_BYTES = 1;
  static readonly MAX_BYTES = 1_048_576 * 10; // 10 MB
  static readonly MAX_WAIT_TIME = 5_000;
  static readonly METADATA_MAX_AGE = 300_000;
  static readonly GROUP_PROTOCOL = KafkaGroupProtocol.CLASSIC;

  static readonly CONSUME_MODE = 'committed';
  static readonly CONSUME_FALLBACK_MODE = 'latest';

  static readonly RECONNECT_DELAY = 2_000;
  static readonly MAX_RECONNECT_ATTEMPTS = 5;
  static readonly SHUTDOWN_TIMEOUT = 30_000;
  static readonly LAG_MONITOR_INTERVAL = 30_000;
}

/** Why every broker of a consumer is gone: DISCONNECTED (the connections closed) or FAILED (they errored). */
export class KafkaBrokersDownReasons {
  static readonly DISCONNECTED = 'disconnected';
  static readonly FAILED = 'failed';

  static readonly SCHEME_SET = new Set<string>([this.DISCONNECTED, this.FAILED]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid Kafka brokers-down reason values. */
export type TKafkaBrokersDownReason = TConstValue<typeof KafkaBrokersDownReasons>;
