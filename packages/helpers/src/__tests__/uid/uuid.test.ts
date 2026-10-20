import { describe, expect, test } from 'bun:test';
import { createUuidV7, UuidHelper, UuidNamespaces } from '@/modules/uid';
import { Sha1Digest } from '@/modules/uid/uuid/sha1';
import { createUuidV5 } from '@/modules/uid/uuid/v5';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const toHex = (opts: { bytes: Uint8Array }): string =>
  [...opts.bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

const nativeSha1 = (opts: { bytes: Uint8Array }): string =>
  new Bun.CryptoHasher('sha1').update(opts.bytes).digest('hex');

describe('Sha1Digest', () => {
  test('matches the platform hash on the empty input', () => {
    const digest = Sha1Digest.of({ bytes: new Uint8Array(0) });
    expect(toHex({ bytes: digest })).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  // 55/56 and 63/64 are where padding needs an extra block: a wrong bound only shows there.
  test.each([0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 4096])(
    'matches the platform hash on %i bytes',
    length => {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);

      expect(toHex({ bytes: Sha1Digest.of({ bytes }) })).toBe(nativeSha1({ bytes }));
    },
  );

  test('matches the platform hash on 200 random inputs', () => {
    const mismatched: Array<number> = [];

    for (let round = 0; round < 200; round++) {
      const bytes = new Uint8Array(Math.floor(Math.random() * 300));
      crypto.getRandomValues(bytes);

      if (toHex({ bytes: Sha1Digest.of({ bytes }) }) !== nativeSha1({ bytes })) {
        mismatched.push(bytes.length);
      }
    }

    expect(mismatched).toEqual([]);
  });

  test('a shared work buffer does not leak between calls', () => {
    const first = new Uint8Array(200);
    const second = new Uint8Array(8);
    crypto.getRandomValues(first);
    crypto.getRandomValues(second);

    Sha1Digest.of({ bytes: first });
    expect(toHex({ bytes: Sha1Digest.of({ bytes: second }) })).toBe(nativeSha1({ bytes: second }));
  });
});

describe('UuidNamespaces', () => {
  test('carry the RFC 9562 values', () => {
    expect(UuidNamespaces.DNS).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(UuidNamespaces.URL).toBe('6ba7b811-9dad-11d1-80b4-00c04fd430c8');
    expect(UuidNamespaces.OID).toBe('6ba7b812-9dad-11d1-80b4-00c04fd430c8');
    expect(UuidNamespaces.X500).toBe('6ba7b814-9dad-11d1-80b4-00c04fd430c8');
  });
});

describe('UuidHelper.v5', () => {
  const uuid = UuidHelper.getInstance();

  test('reproduces the published vector', () => {
    const id = uuid.v5({ namespace: UuidNamespaces.DNS, name: 'www.example.com' });
    expect(id).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  test('is deterministic - the same inputs answer the same id', () => {
    const name = 'order-4711:2026-09-18';
    const first = uuid.v5({ namespace: UuidNamespaces.URL, name });
    const second = uuid.v5({ namespace: UuidNamespaces.URL, name });

    expect(first).toBe(second);
    expect(first).toMatch(UUID_SHAPE);
  });

  test('the namespace partitions the space', () => {
    const name = 'www.example.com';
    expect(uuid.v5({ namespace: UuidNamespaces.DNS, name })).not.toBe(
      uuid.v5({ namespace: UuidNamespaces.URL, name }),
    );
  });

  test('carries version 5 and the RFC variant', () => {
    const id = uuid.v5({ namespace: UuidNamespaces.OID, name: 'anything' });
    expect(id[14]).toBe('5');
    expect('89ab').toContain(id[19]);
  });

  test('reads a name as UTF-8, not as code units', () => {
    const id = uuid.v5({ namespace: UuidNamespaces.DNS, name: 'nguyễn-phát' });
    expect(id).toMatch(UUID_SHAPE);
    expect(id).toBe(uuid.v5({ namespace: UuidNamespaces.DNS, name: 'nguyễn-phát' }));
  });

  test('an empty name is still an id, not a throw', () => {
    expect(uuid.v5({ namespace: UuidNamespaces.DNS, name: '' })).toMatch(UUID_SHAPE);
  });

  // RFC 9562: hex is case-insensitive on input, so an uppercase namespace is the same namespace.
  test('reads a namespace case-insensitively', () => {
    const name = 'www.example.com';
    expect(uuid.v5({ namespace: UuidNamespaces.DNS.toUpperCase(), name })).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  test('accepts the nil UUID as a namespace', () => {
    const namespace = '00000000-0000-0000-0000-000000000000';
    expect(uuid.v5({ namespace, name: 'x' })).toBe(uuid.v5({ namespace, name: 'x' }));
  });

  // Encoding replaces a lone surrogate with U+FFFD, so two different malformed names would
  // silently share one id - a collision on an idempotency key.
  test('refuses a name carrying a lone surrogate', () => {
    expect(() => uuid.v5({ namespace: UuidNamespaces.DNS, name: 'order-\uD800' })).toThrow(
      /lone surrogate/,
    );
  });

  /** RFC 9562 v5 from the platform SHA-1: an oracle that shares no code with the generator. */
  const referenceV5 = (opts: { namespace: string; name: string }): string => {
    const namespaceBytes = Uint8Array.from(
      opts.namespace
        .replaceAll('-', '')
        .match(/../g)
        ?.map(pair => Number.parseInt(pair, 16)) ?? [],
    );
    const hash = new Bun.CryptoHasher('sha1')
      .update(namespaceBytes)
      .update(new TextEncoder().encode(opts.name))
      .digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = toHex({ bytes: hash.subarray(0, 16) });
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  test.each([
    ['empty', ''],
    ['one past the shared buffer', 'x'.repeat(166)],
    ['multi-byte', 'đơn hàng 🧾 #42'],
    ['very long', 'y'.repeat(5_000_000)],
  ])('a %s name matches the reference SHA-1 digest', (_label, name) => {
    expect(uuid.v5({ namespace: UuidNamespaces.DNS, name })).toBe(
      referenceV5({ namespace: UuidNamespaces.DNS, name }),
    );
  });

  test('a very long name does not keep its buffer afterwards', () => {
    // Bun reports ArrayBuffer memory under `external`; `arrayBuffers` stays 0 there.
    const generate = createUuidV5();
    const name = 'x'.repeat(5_000_000);
    generate({ namespace: UuidNamespaces.DNS, name: 'warm' });
    Bun.gc(true);
    const before = process.memoryUsage().external;

    generate({ namespace: UuidNamespaces.DNS, name });
    generate({ namespace: UuidNamespaces.DNS, name: 'short' });
    Bun.gc(true);

    expect(process.memoryUsage().external - before).toBeLessThan(5_000_000);
  });

  test('a namespace that is not a UUID is refused', () => {
    expect(() => uuid.v5({ namespace: 'not-a-uuid', name: 'x' })).toThrow(/namespace/i);
  });

  test('accepts a namespace a caller minted themselves', () => {
    const namespace = uuid.v4();
    expect(uuid.v5({ namespace, name: 'tenant-a' })).toMatch(UUID_SHAPE);
  });
});

describe('UuidHelper.v4', () => {
  const uuid = UuidHelper.getInstance();

  test('carries version 4 and the RFC variant', () => {
    const id = uuid.v4();
    expect(id).toMatch(UUID_SHAPE);
    expect(id[14]).toBe('4');
    expect('89ab').toContain(id[19]);
  });

  test('does not repeat across 20k draws', () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => uuid.v4()));
    expect(ids.size).toBe(20_000);
  });
});

describe('UuidHelper.v7', () => {
  const uuid = UuidHelper.getInstance();

  test('carries version 7 and climbs', () => {
    const ids = Array.from({ length: 5_000 }, () => uuid.v7());
    const sorted = [...ids].sort();

    expect(ids[0][14]).toBe('7');
    expect(ids).toEqual(sorted);
  });
});

describe('UuidHelper.inspect', () => {
  const uuid = UuidHelper.getInstance();

  test('names the version of each kind', () => {
    expect(uuid.inspect({ value: uuid.v4() })?.version).toBe(4);
    expect(uuid.inspect({ value: uuid.v7() })?.version).toBe(7);
    expect(
      uuid.inspect({ value: uuid.v5({ namespace: UuidNamespaces.DNS, name: 'x' }) })?.version,
    ).toBe(5);
  });

  // A private sequence: the shared one carries whatever an earlier burst in this process borrowed.
  test('reads the creation time out of a v7 id', () => {
    const generate = createUuidV7();
    const before = Date.now();
    const inspected = uuid.inspect({ value: generate() });
    const after = Date.now();

    expect(inspected?.createdAt).toBeInstanceOf(Date);
    expect(inspected?.createdAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(inspected?.createdAt?.getTime()).toBeLessThanOrEqual(after);
  });

  test('a burst leads the clock by the milliseconds it borrowed, and no more', () => {
    const generate = createUuidV7();
    const count = 20_000;
    const ids = Array.from({ length: count }, () => generate());
    const last = uuid.inspect({ value: ids[count - 1] })?.createdAt?.getTime() ?? 0;

    // The counter seeds below 0x800, so a millisecond holds at least 2048 ids before it borrows.
    expect(last - Date.now()).toBeLessThanOrEqual(Math.ceil(count / 2048) + 1);
  });

  test('a v4 id carries no creation time - the bits are random', () => {
    expect(uuid.inspect({ value: uuid.v4() })?.createdAt).toBeUndefined();
  });

  test.each([
    '',
    'not-a-uuid',
    '2ed6657d-e927-568b-95e1-2665a8aea6a',
    'zzzzzzzz-e927-568b-95e1-2665a8aea6a2',
  ])('answers undefined for %p', value => {
    expect(uuid.inspect({ value })).toBeUndefined();
  });
});

describe('UuidHelper.isValid', () => {
  test('accepts every version this helper mints', () => {
    const uuid = UuidHelper.getInstance();

    expect(UuidHelper.isValid(uuid.v4())).toBe(true);
    expect(UuidHelper.isValid(uuid.v7())).toBe(true);
    expect(UuidHelper.isValid(uuid.v5({ namespace: UuidNamespaces.DNS, name: 'x' }))).toBe(true);
  });

  test('refuses what is not a UUID', () => {
    expect(UuidHelper.isValid('not-a-uuid')).toBe(false);
    expect(UuidHelper.isValid('2ed6657d-e927-568b-95e1-2665a8aea6a2 ')).toBe(false);
    expect(UuidHelper.isValid(UuidNamespaces.DNS.toUpperCase())).toBe(false);
  });
});

describe('UuidHelper.getInstance', () => {
  test('answers one instance per realm', () => {
    expect(UuidHelper.getInstance()).toBe(UuidHelper.getInstance());
  });
});
