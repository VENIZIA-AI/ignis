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
  static readonly METADATA_MAX_AGE = 300_000;
  static readonly GROUP_PROTOCOL = KafkaGroupProtocol.CLASSIC;
}
