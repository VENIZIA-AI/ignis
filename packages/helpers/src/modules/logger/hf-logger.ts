/** High-frequency logger using a lock-free ring buffer with async flush. */

const BUFFER_SIZE = 65536;
const ENTRY_SIZE = 256;
const buffer = new SharedArrayBuffer(BUFFER_SIZE * ENTRY_SIZE);
const view = new DataView(buffer);
const textEncoder = new TextEncoder();

let writeIndex = 0;

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  emerg: 4,
} as const;

type THfLogLevel = keyof typeof LEVELS;

const scopeCache = new Map<string, Uint8Array>();

function getScopeBytes(scope: string): Uint8Array {
  let bytes = scopeCache.get(scope);
  if (!bytes) {
    bytes = textEncoder.encode(scope.padEnd(32).slice(0, 32)); // Fixed 32 bytes
    scopeCache.set(scope, bytes);
  }
  return bytes;
}

/** Entry layout: [0-7] timestamp, [8] level, [9-40] scope, [41-255] message. */
export class HfLogger {
  private readonly scopeBytes: Uint8Array;

  private constructor(scope: string) {
    this.scopeBytes = getScopeBytes(scope);
  }

  private static cache = new Map<string, HfLogger>();

  static get(scope: string): HfLogger {
    let logger = this.cache.get(scope);
    if (!logger) {
      logger = new HfLogger(scope);
      this.cache.set(scope, logger);
    }
    return logger;
  }

  log(level: THfLogLevel, messageBytes: Uint8Array): void {
    const slot = writeIndex++ & (BUFFER_SIZE - 1);
    const offset = slot * ENTRY_SIZE;

    view.setBigInt64(offset, BigInt(Date.now() * 1000000), true);
    view.setUint8(offset + 8, LEVELS[level]);
    new Uint8Array(buffer, offset + 9, 32).set(this.scopeBytes);

    const msgLen = Math.min(messageBytes.length, 215);
    new Uint8Array(buffer, offset + 41, msgLen).set(messageBytes.subarray(0, msgLen));
  }

  private static readonly MSG_CACHE = new Map<string, Uint8Array>();

  static encodeMessage(msg: string): Uint8Array {
    let bytes = this.MSG_CACHE.get(msg);
    if (!bytes) {
      bytes = textEncoder.encode(msg);
      this.MSG_CACHE.set(msg, bytes);
    }
    return bytes;
  }
}

/** Flushes the ring buffer to output without blocking the hot path. */
export class HfLogFlusher {
  private flushIndex = 0;

  async flush(): Promise<void> {
    while (this.flushIndex < writeIndex) {
      const slot = this.flushIndex++ & (BUFFER_SIZE - 1);
      const offset = slot * ENTRY_SIZE;

      const timestamp = view.getBigInt64(offset, true);
      const level = view.getUint8(offset + 8);
      const scope = new Uint8Array(buffer, offset + 9, 32);
      const message = new Uint8Array(buffer, offset + 41, 215);

      console.log(
        `${timestamp} [${level}] ${new TextDecoder().decode(scope).trim()} ${new TextDecoder().decode(message).trim()}`,
      );
    }
  }

  start(intervalMs = 100): void {
    setInterval(() => this.flush(), intervalMs);
  }
}
