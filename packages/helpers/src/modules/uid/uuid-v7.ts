import { BaseHelper } from '../base';

/**
 * RFC 9562 UUID version 7: 48-bit unix milliseconds, then randomness. Ids sort as text in creation
 * order, so a primary-key B-tree appends instead of splitting pages - measured on PGlite, 200k
 * inserts ran 11-36% faster with a 27% smaller index than version 4.
 *
 * Bun's native `randomUUIDv7` when present (monotonic, fastest); elsewhere - a browser - the same
 * shape from `getRandomValues`, with a 12-bit counter keeping ids ordered inside one millisecond.
 */
export class UuidV7Generator extends BaseHelper {
  private static instance?: UuidV7Generator;

  private static readonly HEX_OCTETS = Array.from({ length: 256 }, (_, value) =>
    (value + 0x100).toString(16).slice(1),
  );

  /** 256 ids of entropy per `getRandomValues` call. */
  private static readonly POOL_SIZE = 8 * 256;

  private static readonly MAX_COUNTER = 0xfff;

  private readonly generate: () => string;

  private readonly pool = new Uint8Array(UuidV7Generator.POOL_SIZE);
  private offset = UuidV7Generator.POOL_SIZE;
  private lastMs = -1;
  private counter = 0;
  /** `xxxxxxxx-xxxx-` for `lastMs`, rebuilt only when the millisecond changes. */
  private prefix = '';

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? UuidV7Generator.name });

    const native = typeof Bun === 'undefined' ? undefined : Bun.randomUUIDv7;
    this.generate = typeof native === 'function' ? native : () => this.fromEntropy();
  }

  /** One sequence per realm: ids from every caller stay ordered against each other. */
  static getInstance(): UuidV7Generator {
    return (UuidV7Generator.instance ??= new UuidV7Generator());
  }

  nextId(): string {
    return this.generate();
  }

  private fromEntropy(): string {
    const now = Date.now();

    if (now > this.lastMs) {
      this.lastMs = now;
      this.counter = this.drawCounterSeed();
      this.prefix = this.renderPrefix({ ms: now });
    } else if (++this.counter > UuidV7Generator.MAX_COUNTER) {
      // Counter spent, or the clock stepped back: borrow the next millisecond rather than repeat.
      this.lastMs += 1;
      this.counter = this.drawCounterSeed();
      this.prefix = this.renderPrefix({ ms: this.lastMs });
    }

    if (this.offset > UuidV7Generator.POOL_SIZE - 8) {
      globalThis.crypto.getRandomValues(this.pool);
      this.offset = 0;
    }

    const pool = this.pool;
    const at = this.offset;
    this.offset = at + 8;

    const hex = UuidV7Generator.HEX_OCTETS;
    const counter = this.counter;

    return (
      this.prefix +
      hex[0x70 | (counter >>> 8)] +
      hex[counter & 0xff] +
      '-' +
      hex[(pool[at] & 0x3f) | 0x80] +
      hex[pool[at + 1]] +
      '-' +
      hex[pool[at + 2]] +
      hex[pool[at + 3]] +
      hex[pool[at + 4]] +
      hex[pool[at + 5]] +
      hex[pool[at + 6]] +
      hex[pool[at + 7]]
    );
  }

  /** Seeds below 0x800, leaving at least 2048 increments inside the millisecond. */
  private drawCounterSeed(): number {
    if (this.offset > UuidV7Generator.POOL_SIZE - 2) {
      globalThis.crypto.getRandomValues(this.pool);
      this.offset = 0;
    }

    const seed = ((this.pool[this.offset] << 8) | this.pool[this.offset + 1]) & 0x7ff;
    this.offset += 2;
    return seed;
  }

  private renderPrefix(opts: { ms: number }): string {
    const { ms } = opts;
    const hex = UuidV7Generator.HEX_OCTETS;
    // 48 bits exceed the 32-bit bitwise range: split at 24 bits with arithmetic first.
    const high = Math.floor(ms / 0x1000000);
    const low = ms % 0x1000000;

    return (
      hex[(high >>> 16) & 0xff] +
      hex[(high >>> 8) & 0xff] +
      hex[high & 0xff] +
      hex[(low >>> 16) & 0xff] +
      '-' +
      hex[(low >>> 8) & 0xff] +
      hex[low & 0xff] +
      '-'
    );
  }
}
