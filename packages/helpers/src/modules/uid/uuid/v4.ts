import { UUID_HEX_OCTETS } from './common/constants';

const POOL_SIZE = 16 * 256;

export class UuidV4Generator {
  /**
   * Builds a v4 generator. `crypto.randomUUID` is captured once - whether a realm is a secure context
   * never changes - and called with no argument, since Node validates it and `['a'].map(...)` would
   * throw.
   */
  static create(): () => string {
    const randomUuid = globalThis.crypto?.randomUUID;
    if (typeof randomUuid === 'function') {
      const native = randomUuid.bind(globalThis.crypto);
      return () => native();
    }

    const pool = new Uint8Array(POOL_SIZE);
    let offset = POOL_SIZE;

    return () => {
      if (offset > POOL_SIZE - 16) {
        globalThis.crypto.getRandomValues(pool);
        offset = 0;
      }

      const at = offset;
      offset = at + 16;

      const version = (pool[at + 6] & 0x0f) | 0x40;
      const variant = (pool[at + 8] & 0x3f) | 0x80;
      const hex = UUID_HEX_OCTETS;

      return (
        hex[pool[at]] +
        hex[pool[at + 1]] +
        hex[pool[at + 2]] +
        hex[pool[at + 3]] +
        '-' +
        hex[pool[at + 4]] +
        hex[pool[at + 5]] +
        '-' +
        hex[version] +
        hex[pool[at + 7]] +
        '-' +
        hex[variant] +
        hex[pool[at + 9]] +
        '-' +
        hex[pool[at + 10]] +
        hex[pool[at + 11]] +
        hex[pool[at + 12]] +
        hex[pool[at + 13]] +
        hex[pool[at + 14]] +
        hex[pool[at + 15]]
      );
    };
  }

  private static readonly shared: () => string = UuidV4Generator.create();

  /** Mints a random UUID v4 - a public identifier or a token. Reads no `this`, so `['a'].map(UuidV4Generator.generate)` is safe. */
  static generate(): string {
    return UuidV4Generator.shared();
  }
}

/** @deprecated Use UuidV4Generator.create(). Removed in 0.5. */
export const createUuidV4 = (): (() => string) => UuidV4Generator.create();

/** @deprecated Use UuidV4Generator.generate(). Removed in 0.5. */
export const uuidV4: () => string = () => UuidV4Generator.generate();
