import { HTTP } from '@/common/constants';
import { BaseHelper } from '../base';
import { getError } from '../error/app-error';

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Snowflake ID Configuration Constants (48-10-12)
 * - 48 bits: timestamp (~8,919 years from epoch)
 * - 10 bits: worker ID (1024 workers max)
 * - 12 bits: sequence (4096 per ms per worker)
 */
export class SnowflakeConfig {
  static readonly DEFAULT_EPOCH = BigInt(1735689600000); // 2025-01-01 00:00:00 UTC
  static readonly TIMESTAMP_BITS = BigInt(48);
  static readonly WORKER_ID_BITS = BigInt(10);
  static readonly SEQUENCE_BITS = BigInt(12);
  static readonly MAX_WORKER_ID = (BigInt(1) << BigInt(10)) - BigInt(1); // 1023
  static readonly MAX_SEQUENCE = (BigInt(1) << BigInt(12)) - BigInt(1); // 4095
  static readonly WORKER_ID_SHIFT = BigInt(12);
  static readonly TIMESTAMP_SHIFT = BigInt(22); // 10 + 12
  static readonly MAX_CLOCK_BACKWARD_MS = BigInt(100);

  // 48 bits max = ~8,919 years, warn 10 years before expiry (~8,909 years)
  static readonly MAX_TIMESTAMP_MS = (BigInt(1) << BigInt(48)) - BigInt(1);
  static readonly WARNING_THRESHOLD_MS = BigInt(Math.floor(8909 * 365.25 * 24 * 60 * 60 * 1000)); // ~8,909 years
}

export interface IIdGeneratorOptions {
  workerId?: number;
  epoch?: bigint;
}

export interface ISnowflakeParsedId {
  raw: bigint;
  timestamp: Date;
  workerId: number;
  sequence: number;
}

/** Snowflake ID generator with Base62 encoding for distributed, time-sortable unique IDs. */
export class SnowflakeUidHelper extends BaseHelper {
  private readonly workerId: bigint;
  private readonly epoch: bigint;
  private sequence: bigint = BigInt(0);
  private lastTimestamp: bigint = BigInt(-1);

  constructor(opts?: IIdGeneratorOptions) {
    super({ scope: SnowflakeUidHelper.name });

    const workerId = opts?.workerId ?? 199;
    const epoch = opts?.epoch ?? SnowflakeConfig.DEFAULT_EPOCH;

    this.validateWorkerId(workerId);
    this.workerId = BigInt(workerId);

    this.validateEpoch(epoch);
    this.epoch = epoch;

    this.logger
      .for(this.constructor.name)
      .info(
        'Initialized | workerId: %d | epoch: %s | epochDate: %s',
        workerId,
        epoch.toString(),
        new Date(Number(epoch)).toISOString(),
      );
  }

  /** Generate next unique ID as Base62 string. */
  nextId(): string {
    const snowflake = this.nextSnowflake();
    return this.encodeBase62(snowflake);
  }

  /** Generate next unique ID as raw Snowflake bigint. */
  nextSnowflake(): bigint {
    let timestamp = this.currentTimestamp();

    if (timestamp < this.lastTimestamp) {
      const diff = this.lastTimestamp - timestamp;
      this.logger
        .for(this.nextSnowflake.name)
        .warn('Clock moved backward | diff: %d ms', Number(diff));

      if (diff <= SnowflakeConfig.MAX_CLOCK_BACKWARD_MS) {
        timestamp = this.waitForNextMs(this.lastTimestamp);
      } else {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[IdGenerator][nextSnowflake] Clock moved backward by ${diff}ms. Refusing to generate ID.`,
        });
      }
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + BigInt(1)) & SnowflakeConfig.MAX_SEQUENCE;

      if (this.sequence === BigInt(0)) {
        timestamp = this.waitForNextMs(timestamp);
      }
    } else {
      this.sequence = BigInt(0);
    }

    this.lastTimestamp = timestamp;

    this.checkExpiryWarning(timestamp);

    const id =
      ((timestamp - this.epoch) << SnowflakeConfig.TIMESTAMP_SHIFT) |
      (this.workerId << SnowflakeConfig.WORKER_ID_SHIFT) |
      this.sequence;

    return id;
  }

  /** Encode a bigint to Base62 string. */
  encodeBase62(num: bigint): string {
    if (num === BigInt(0)) {
      return BASE62_CHARS[0];
    }

    let result = '';
    let value = num;
    const base = BigInt(BASE62_CHARS.length);

    while (value > BigInt(0)) {
      const remainder = value % base;
      result = BASE62_CHARS[Number(remainder)] + result;
      value = value / base;
    }

    return result;
  }

  /** Decode a Base62 string to bigint. */
  decodeBase62(str: string): bigint {
    let result = BigInt(0);
    const base = BigInt(BASE62_CHARS.length);

    for (const char of str) {
      const index = BASE62_CHARS.indexOf(char);
      if (index === -1) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: `[IdGenerator][decodeBase62] Invalid Base62 character: ${char}`,
        });
      }
      result = result * base + BigInt(index);
    }

    return result;
  }

  /** Extract timestamp from a Snowflake ID. */
  extractTimestamp(id: bigint): Date {
    const timestamp = (id >> SnowflakeConfig.TIMESTAMP_SHIFT) + this.epoch;
    return new Date(Number(timestamp));
  }

  /** Extract worker ID from a Snowflake ID. */
  extractWorkerId(id: bigint): number {
    const extractedWorkerId =
      (id >> SnowflakeConfig.WORKER_ID_SHIFT) & SnowflakeConfig.MAX_WORKER_ID;
    return Number(extractedWorkerId);
  }

  /** Extract sequence from a Snowflake ID. */
  extractSequence(id: bigint): number {
    return Number(id & SnowflakeConfig.MAX_SEQUENCE);
  }

  /** Parse a Base62 ID and extract its components. */
  parseId(base62Id: string): ISnowflakeParsedId {
    const raw = this.decodeBase62(base62Id);
    return {
      raw,
      timestamp: this.extractTimestamp(raw),
      workerId: this.extractWorkerId(raw),
      sequence: this.extractSequence(raw),
    };
  }

  /** Get current worker ID. */
  getWorkerId(): number {
    return Number(this.workerId);
  }

  private currentTimestamp(): bigint {
    return BigInt(Date.now());
  }

  private waitForNextMs(lastTimestamp: bigint): bigint {
    let timestamp = this.currentTimestamp();
    while (timestamp <= lastTimestamp) {
      timestamp = this.currentTimestamp();
    }
    return timestamp;
  }

  private validateWorkerId(workerId: number): void {
    if (workerId < 0 || workerId > Number(SnowflakeConfig.MAX_WORKER_ID)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[IdGenerator][validateWorkerId] Worker ID must be between 0 and ${SnowflakeConfig.MAX_WORKER_ID} | received: ${workerId}`,
      });
    }
  }

  private validateEpoch(epoch: bigint): void {
    const now = BigInt(Date.now());

    if (epoch <= BigInt(0)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[IdGenerator][validateEpoch] Epoch must be a positive number | received: ${epoch}`,
      });
    }

    if (epoch > now) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[IdGenerator][validateEpoch] Epoch cannot be in the future | received: ${epoch} (${new Date(Number(epoch)).toISOString()}) | now: ${now}`,
      });
    }
  }

  private checkExpiryWarning(timestamp: bigint): void {
    const elapsedMs = timestamp - this.epoch;

    if (elapsedMs < SnowflakeConfig.WARNING_THRESHOLD_MS) {
      return;
    }

    const remainingMs = SnowflakeConfig.MAX_TIMESTAMP_MS - elapsedMs;
    const remainingYears = Number(remainingMs) / (365.25 * 24 * 60 * 60 * 1000);
    const expiryDate = new Date(Number(this.epoch + SnowflakeConfig.MAX_TIMESTAMP_MS));

    this.logger
      .for(this.checkExpiryWarning.name)
      .warn(
        'Snowflake ID sequence approaching expiry | remainingYears: %.2f | expiryDate: %s | action: Plan migration to new epoch',
        remainingYears,
        expiryDate.toISOString(),
      );
  }
}
