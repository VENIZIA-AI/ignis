// -------------------------------------------------------------------------
// Group protocol enumeration
// -------------------------------------------------------------------------

import { TConstValue } from '@/common';

export class KafkaGroupProtocol {
  static readonly CLASSIC = 'classic';
  static readonly CONSUMER = 'consumer';

  static readonly SCHEME_SET = new Set([this.CLASSIC, this.CONSUMER]);

  static isValid(mode: string): boolean {
    return this.SCHEME_SET.has(mode);
  }
}

export type TKafkaGroupProtocol = TConstValue<typeof KafkaGroupProtocol>;

// -------------------------------------------------------------------------
// Acks enumeration
// -------------------------------------------------------------------------

export class KafkaAcks {
  static readonly NONE = 0; // No acknowledgment — fire-and-forget
  static readonly LEADER = 1; // Leader acknowledgment only
  static readonly ALL = -1; // Full ISR acknowledgment

  static readonly SCHEME_SET = new Set([this.NONE, this.LEADER, this.ALL]);

  static isValid(ack: number): boolean {
    return this.SCHEME_SET.has(ack);
  }
}

export type TKafkaAcks = TConstValue<typeof KafkaAcks>;

// -------------------------------------------------------------------------
// Default values
// -------------------------------------------------------------------------

export class KafkaHealthStatuses {
  static readonly CONNECTED = 'connected';
  static readonly DISCONNECTED = 'disconnected';
  static readonly UNKNOWN = 'unknown';

  static readonly SCHEME_SET = new Set([this.CONNECTED, this.DISCONNECTED, this.UNKNOWN]);

  static isValid(status: string): boolean {
    return this.SCHEME_SET.has(status);
  }
}

export type TKafkaHealthStatus = TConstValue<typeof KafkaHealthStatuses>;

// -------------------------------------------------------------------------
// Kafka events
// -------------------------------------------------------------------------

export class KafkaClientEvents {
  // Broker events
  static readonly BROKER_CONNECT = 'client:broker:connect';
  static readonly BROKER_DISCONNECT = 'client:broker:disconnect';
  static readonly BROKER_FAILED = 'client:broker:failed';

  // Consumer events
  static readonly CONSUMER_GROUP_JOIN = 'consumer:group:join';
  static readonly CONSUMER_GROUP_LEAVE = 'consumer:group:leave';
  static readonly CONSUMER_GROUP_REBALANCE = 'consumer:group:rebalance';
  static readonly CONSUMER_HEARTBEAT_ERROR = 'consumer:heartbeat:error';
  static readonly CONSUMER_LAG = 'consumer:lag';
  static readonly CONSUMER_LAG_ERROR = 'consumer:lag:error';

  // Stream events
  static readonly STREAM_DATA = 'data';
  static readonly STREAM_ERROR = 'error';
}

// -------------------------------------------------------------------------
// Default values
// -------------------------------------------------------------------------

export class KafkaDefaults {
  // Shared
  static readonly RETRIES = 3;
  static readonly RETRY_DELAY = 1_000;

  // Producer
  static readonly STRICT = true;
  static readonly AUTOCREATE_TOPICS = false;

  // Consumer
  static readonly AUTOCOMMIT = false;
  static readonly SESSION_TIMEOUT = 30_000;
  static readonly HEARTBEAT_INTERVAL = 3_000;
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
