import { AnyType } from '@/common/types';
import { AbstractLogger } from '../base';
import { ILogger, SHOULD_LOG_DEBUG, TLogLevel } from '../common';
import { formatLogMessage } from '../formatting';
import {
  BUFFER_SIZE,
  ENTRY_SIZE,
  HF_LEVEL_CODES,
  HF_MESSAGE_MAX_BYTES,
  HF_SCOPE_MAX_BYTES,
  MESSAGE_CACHE_CAP,
  OFFSET_LEVEL,
  OFFSET_MESSAGE,
  OFFSET_MESSAGE_LENGTH,
  OFFSET_SCOPE,
  OFFSET_SCOPE_LENGTH,
  TRingState,
} from './common';
import { HfLogRing } from './ring';

/** Ring-buffer logger for hot paths; extends AbstractLogger, NOT BaseLogger - BaseLogger's string-sink plumbing is exactly the cost this implementation exists to avoid. */
export class HfLogger extends AbstractLogger {
  private static readonly textEncoder = new TextEncoder();
  private static readonly scopeCache = new Map<string, Uint8Array>();
  private static cache = new Map<string, HfLogger>();
  private static messageCache = new Map<string, Uint8Array>();

  private readonly scope: string;
  private readonly scopeBytes: Uint8Array;
  private readonly scopeLength: number;
  // Resolved once at construction (get() has already allocated the ring): saves a call and a null-check per log on a path budgeted in nanoseconds.
  private readonly ring: TRingState;

  private constructor(scope: string) {
    super();
    this.scope = scope;
    this.scopeBytes = HfLogger.encodeScope(scope);
    this.scopeLength = this.scopeBytes.length;
    this.ring = HfLogRing.get();
  }

  private static encodeScope(scope: string): Uint8Array {
    let bytes = HfLogger.scopeCache.get(scope);
    if (!bytes) {
      bytes = HfLogger.textEncoder.encode(scope).subarray(0, HF_SCOPE_MAX_BYTES);
      HfLogger.scopeCache.set(scope, bytes);
    }
    return bytes;
  }

  static get(scope: string): HfLogger {
    let logger = this.cache.get(scope);
    if (!logger) {
      logger = new HfLogger(scope); // first logger allocates the ring - never at import
      this.cache.set(scope, logger);
    }
    return logger;
  }

  /** Pre-encode a message at initialization time; the cache is FIFO-bounded so dynamic strings can't grow it without limit. */
  static encodeMessage(message: string): Uint8Array {
    const cached = this.messageCache.get(message);
    if (cached) {
      return cached;
    }

    const bytes = HfLogger.textEncoder.encode(message);
    if (this.messageCache.size >= MESSAGE_CACHE_CAP) {
      this.evictOldestMessage();
    }
    this.messageCache.set(message, bytes);
    return bytes;
  }

  private static evictOldestMessage(): void {
    const oldest = this.messageCache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    this.messageCache.delete(oldest);
  }

  private writeEntry(levelCode: number, messageBytes: Uint8Array): void {
    const ring = this.ring;
    const slot = ring.writeIndex++ & (BUFFER_SIZE - 1);
    const offset = slot * ENTRY_SIZE;
    ring.f64[offset >> 3] = performance.timeOrigin + performance.now();
    const bytes = ring.bytes;
    bytes[offset + OFFSET_LEVEL] = levelCode;
    bytes[offset + OFFSET_SCOPE_LENGTH] = this.scopeLength;
    bytes.set(this.scopeBytes, offset + OFFSET_SCOPE);
    const messageLength =
      messageBytes.length < HF_MESSAGE_MAX_BYTES ? messageBytes.length : HF_MESSAGE_MAX_BYTES;
    bytes[offset + OFFSET_MESSAGE_LENGTH] = messageLength;
    bytes.set(
      messageLength === messageBytes.length
        ? messageBytes
        : messageBytes.subarray(0, messageLength),
      offset + OFFSET_MESSAGE,
    );
  }

  private writeString(levelCode: number, message: string, args: Array<AnyType>): void {
    if (args.length > 0) {
      // Slow path, documented: args are formatted (deep inspection + redaction) - never dropped.
      this.writeEntry(levelCode, HfLogger.textEncoder.encode(formatLogMessage({ message, args })));
      return;
    }
    this.writeEntry(levelCode, HfLogger.encodeMessage(message));
  }

  debug(message: string, ...args: AnyType[]): void {
    if (!SHOULD_LOG_DEBUG) {
      return;
    }
    this.writeString(HF_LEVEL_CODES.debug, message, args);
  }

  info(message: string, ...args: AnyType[]): void {
    this.writeString(HF_LEVEL_CODES.info, message, args);
  }

  warn(message: string, ...args: AnyType[]): void {
    this.writeString(HF_LEVEL_CODES.warn, message, args);
  }

  error(message: string, ...args: AnyType[]): void {
    this.writeString(HF_LEVEL_CODES.error, message, args);
  }

  emerg(message: string, ...args: AnyType[]): void {
    this.writeString(HF_LEVEL_CODES.emerg, message, args);
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]): void;
  log(level: TLogLevel, messageBytes: Uint8Array): void;
  log(level: TLogLevel, message: string | Uint8Array, ...args: AnyType[]): void {
    const levelCode = HF_LEVEL_CODES[level] ?? HF_LEVEL_CODES.info;
    if (typeof message === 'string') {
      this.writeString(levelCode, message, args);
      return;
    }
    this.writeEntry(levelCode, message);
  }

  for(methodName: string): ILogger {
    return HfLogger.get(`${this.scope}-${methodName}`);
  }
}
