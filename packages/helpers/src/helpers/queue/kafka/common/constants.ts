export class KafkaDefaults {
  static readonly CLIENT_ID = 'ignis-kafka';
  static readonly SESSION_TIMEOUT = 30_000;
  static readonly HEARTBEAT_INTERVAL = 3_000;
  static readonly MAX_WAIT_TIME = 5_000;
  static readonly HIGH_WATER_MARK = 1024;
  static readonly AUTOCOMMIT_INTERVAL = 100;
}

export class KafkaAcks {
  static readonly NONE = 0;
  static readonly LEADER = 1;
  static readonly ALL = -1;

  static readonly SCHEME_SET = new Set([this.NONE, this.LEADER, this.ALL]);

  static isValid(value: number): boolean {
    return this.SCHEME_SET.has(value);
  }
}
