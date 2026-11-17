import { createHmac, randomBytes } from 'node:crypto';

/**
 * The keys PBKDF2 has derived, kept so a second call (one that starts while the first runs included) shares the result.
 * Bounded, least recently used out first: the entries are keyed by what went into the derivation, which includes a secret
 * a caller may supply per request, so an unbounded map would grow with every distinct one. The key is an HMAC of the
 * inputs under a random key made once per process, so the secret itself is not kept as a map key, and a key read from
 * memory cannot be tested against guesses at SHA-256 speed without that process key.
 */
export class DerivedKeyCache {
  static readonly MAX_ENTRIES = 64;

  /** Made once per process and never leaves it: a cache key from one process means nothing in another. */
  private static readonly PROCESS_KEY = randomBytes(32);

  private readonly entries = new Map<string, Promise<Buffer>>();

  get size(): number {
    return this.entries.size;
  }

  /** The keyed digest of the derivation inputs: what the cache is keyed by. */
  static keyOf(opts: { parts: Array<string | number> }): string {
    const hash = createHmac('sha256', DerivedKeyCache.PROCESS_KEY);

    for (const part of opts.parts) {
      const text = String(part);

      // Length-prefixed, so ["ab", "c"] and ["a", "bc"] cannot meet.
      hash.update(`${text.length}:${text}`);
    }

    return hash.digest('hex');
  }

  /** Runs `derive` once per key. A failed derivation leaves nothing behind, so the next call tries again. */
  deriveOnce(opts: { key: string; derive: () => Promise<Buffer> }): Promise<Buffer> {
    const { key, derive } = opts;
    const pending = this.entries.get(key);

    if (pending) {
      // Most recently used moves to the end.
      this.entries.delete(key);
      this.entries.set(key, pending);

      return pending;
    }

    const derived = derive();
    this.entries.set(key, derived);

    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= DerivedKeyCache.MAX_ENTRIES) {
        break;
      }

      this.entries.delete(oldest);
    }

    derived.catch(() => {
      if (this.entries.get(key) === derived) {
        this.entries.delete(key);
      }
    });

    return derived;
  }
}
