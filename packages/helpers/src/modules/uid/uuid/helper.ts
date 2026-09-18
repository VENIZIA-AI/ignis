import { HTTP } from '@/common/constants';
import { BaseHelper } from '../../base';
import { getError } from '../../error';
import { MAX_CACHED_NAMESPACES, UUID_HEX_OCTETS, UUID_PATTERN } from './common/constants';
import type { IUuidInspection } from './common/types';
import { Sha1Digest } from './sha1';
import { UuidV7Generator } from './v7';

/**
 * One door for every UUID IGNIS mints, so a choice of version is made once per use and not once per
 * call site.
 *
 * - `v7()` - a database key. Ids sort in creation order, so a primary-key B-tree appends instead of
 *   splitting pages. It also reveals when the row was created: never a share link or a reset token.
 * - `v5()` - a deterministic key from business data (an idempotency key). The same inputs always
 *   answer the same id, which is the point and also the limit: anyone holding the inputs can
 *   reproduce it, so it is never a secret. It gives a STABLE key; the unique index on the column is
 *   what actually enforces idempotency.
 * - `v4()` - a random public identifier or token. No clock, nothing to correlate, 122 random bits.
 *
 * `crypto.randomUUID` is used when the host has it, and rebuilt from `getRandomValues` when it does
 * not: browsers gate that one API on a SECURE CONTEXT, and on `http://<lan-ip>` it is simply
 * missing (see {@link RequestIdGenerator} for the measurement).
 */
export class UuidHelper extends BaseHelper {
  /** Realm-keyed: a dual CJS+ESM build puts two copies of this class in one process. */
  private static readonly SHARED_SLOT = Symbol.for('@venizia/ignis-helpers:uuid-helper');

  /** Fits a namespace plus a ~160-character name without growing; longer names reallocate once. */
  private static readonly V5_INPUT_SIZE = 512;

  /** 256 ids of entropy per `getRandomValues` call. */
  private static readonly POOL_SIZE = 16 * 256;

  private readonly v7Generator = UuidV7Generator.getInstance();

  /**
   * Random - a public identifier or a token.
   *
   * A bound function, not a method: one `crypto.randomUUID` costs ~32 ns, and a method forwarding
   * to it measured 40 ns. The wrapper was a fifth of the cost, so there is no wrapper.
   */
  readonly v4: () => string;

  /**
   * Time-ordered - a database key. One sequence per realm, so ids from every caller stay ordered
   * against each other.
   *
   * 4096 ids fit in one millisecond; past that the generator borrows the next one to keep the
   * sequence climbing, so a burst embeds a timestamp slightly AHEAD of the wall clock - roughly one
   * millisecond per 4096 ids. `inspect()` reports what the id carries, which is why a creation time
   * read back inside a burst can sit a few milliseconds in the future.
   */
  readonly v7: () => string;

  private readonly encoder = new TextEncoder();

  /** Parsed namespace bytes: an idempotency key reuses one namespace for every call, and parsing 36 characters each time is work already done. */
  private readonly namespaces = new Map<string, Uint8Array>();

  private readonly pool = new Uint8Array(UuidHelper.POOL_SIZE);
  private offset = UuidHelper.POOL_SIZE;

  /** `namespace | name` for `v5`, grown only when a name outruns it. {@link v5Name} views the name half. */
  private v5Input = new Uint8Array(UuidHelper.V5_INPUT_SIZE);
  private v5Name = this.v5Input.subarray(16);

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? UuidHelper.name });

    // Resolved once: whether a host exposes `randomUUID` is fixed for the life of a realm. Bound,
    // not wrapped - the extra call frame measured 8 ns on every id.
    const native = globalThis.crypto?.randomUUID;
    this.v4 =
      typeof native === 'function' ? native.bind(globalThis.crypto) : () => this.v4FromPool();
    this.v7 = this.v7Generator.nextId;
  }

  static getInstance(): UuidHelper {
    const shared: UuidHelper | undefined = Reflect.get(globalThis, UuidHelper.SHARED_SLOT);
    if (shared) {
      return shared;
    }

    const created = new UuidHelper();
    Reflect.set(globalThis, UuidHelper.SHARED_SLOT, created);
    return created;
  }

  /** Lowercase, version 1-8, RFC variant. The nil and max placeholders are refused. */
  static isValid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  /** Deterministic - `SHA-1(namespace + name)`. The same inputs answer the same id, forever, on every host. */
  v5(opts: { namespace: string; name: string }): string {
    const { namespace, name } = opts;

    const namespaceBytes = this.resolveNamespace({ namespace });

    // Encoded straight into the scratch buffer behind the namespace: `encode()` would allocate an
    // array per call only to copy it. UTF-8 never exceeds 3 bytes per UTF-16 code unit.
    const required = 16 + name.length * 3;
    if (required > this.v5Input.length) {
      this.v5Input = new Uint8Array(required);
      this.v5Name = this.v5Input.subarray(16);
    }

    this.v5Input.set(namespaceBytes);
    const { written } = this.encoder.encodeInto(name, this.v5Name);

    const digest = Sha1Digest.of({ bytes: this.v5Input.subarray(0, 16 + written) });
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;

    return this.format({ bytes: digest });
  }

  /** What the id says about itself, or undefined when it is not a UUID. A v7 id also carries the moment it was minted. */
  inspect(opts: { value: string }): IUuidInspection | undefined {
    const { value } = opts;

    if (!UuidHelper.isValid(value)) {
      return undefined;
    }

    const version = Number.parseInt(value[14], 16);
    if (version !== 7) {
      return { version };
    }

    const milliseconds = Number.parseInt(value.slice(0, 8) + value.slice(9, 13), 16);
    return { version, createdAt: new Date(milliseconds) };
  }

  private resolveNamespace(opts: { namespace: string }): Uint8Array {
    const { namespace } = opts;

    const cached = this.namespaces.get(namespace);
    if (cached) {
      return cached;
    }

    if (!UuidHelper.isValid(namespace)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${UuidHelper.name}][v5] namespace must be a UUID - received: ${namespace}`,
      });
    }

    const bytes = new Uint8Array(16);
    const hex = namespace.replaceAll('-', '');
    for (let index = 0; index < 16; index++) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }

    if (this.namespaces.size < MAX_CACHED_NAMESPACES) {
      this.namespaces.set(namespace, bytes);
    }

    return bytes;
  }

  /** Reads the pool in place: a `subarray` view per id measured 19 ns, more than the entropy costs. */
  private v4FromPool(): string {
    if (this.offset > UuidHelper.POOL_SIZE - 16) {
      globalThis.crypto.getRandomValues(this.pool);
      this.offset = 0;
    }

    const pool = this.pool;
    const at = this.offset;
    this.offset = at + 16;

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
  }

  private format(opts: { bytes: Uint8Array }): string {
    const { bytes } = opts;
    const hex = UUID_HEX_OCTETS;

    return (
      hex[bytes[0]] +
      hex[bytes[1]] +
      hex[bytes[2]] +
      hex[bytes[3]] +
      '-' +
      hex[bytes[4]] +
      hex[bytes[5]] +
      '-' +
      hex[bytes[6]] +
      hex[bytes[7]] +
      '-' +
      hex[bytes[8]] +
      hex[bytes[9]] +
      '-' +
      hex[bytes[10]] +
      hex[bytes[11]] +
      hex[bytes[12]] +
      hex[bytes[13]] +
      hex[bytes[14]] +
      hex[bytes[15]]
    );
  }
}
