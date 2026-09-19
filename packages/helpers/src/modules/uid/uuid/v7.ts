import { UUID_HEX_OCTETS } from './common/constants';

/** One sequence per realm: the CJS and ESM copies must not interleave two counters. */
const SHARED_SLOT = Symbol.for('@venizia/ignis-helpers:uuid-v7');

const POOL_SIZE = 8 * 256;
const MAX_COUNTER = 0xfff;

/** Builds a v7 generator with its own clock state and counter. */
export const createUuidV7 = (): (() => string) => {
  // Through `globalThis`: a member access on the bare global fails the browser-purity gate.
  const runtime: { randomUUIDv7?: () => string } | undefined = Reflect.get(globalThis, 'Bun');
  const native = runtime?.randomUUIDv7;
  if (typeof native === 'function') {
    return native;
  }

  const pool = new Uint8Array(POOL_SIZE);
  let offset = POOL_SIZE;
  let lastMs = -1;
  let counter = 0;
  let prefix = '';

  /** Draws a counter seed below 0x800, leaving room to climb inside the millisecond. */
  const drawCounterSeed = (): number => {
    if (offset > POOL_SIZE - 2) {
      globalThis.crypto.getRandomValues(pool);
      offset = 0;
    }

    const seed = ((pool[offset] << 8) | pool[offset + 1]) & 0x7ff;
    offset += 2;
    return seed;
  };

  /** Renders the 48-bit timestamp half of the id. */
  const renderPrefix = (opts: { ms: number }): string => {
    const { ms } = opts;
    const hex = UUID_HEX_OCTETS;
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
  };

  return () => {
    const now = Date.now();

    if (now > lastMs) {
      lastMs = now;
      counter = drawCounterSeed();
      prefix = renderPrefix({ ms: now });
    } else if (++counter > MAX_COUNTER) {
      // Counter spent, or the clock stepped back: borrow the next millisecond rather than repeat.
      lastMs += 1;
      counter = drawCounterSeed();
      prefix = renderPrefix({ ms: lastMs });
    }

    if (offset > POOL_SIZE - 8) {
      globalThis.crypto.getRandomValues(pool);
      offset = 0;
    }

    const at = offset;
    offset = at + 8;

    const hex = UUID_HEX_OCTETS;

    return (
      prefix +
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
  };
};

const sharedV7: (() => string) | undefined = Reflect.get(globalThis, SHARED_SLOT);
const resolvedV7 = sharedV7 ?? createUuidV7();
if (!sharedV7) {
  Reflect.set(globalThis, SHARED_SLOT, resolvedV7);
}

/** Mints a time-ordered UUID v7 - the default for a string primary key. */
export const uuidV7: () => string = resolvedV7;
