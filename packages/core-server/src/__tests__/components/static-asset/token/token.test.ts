import {
  AssetCommitToken,
  AssetTokenCodecs,
  StaticAssetErrors,
  type IAssetTokenCodec,
  type TAssetCommitTokenOptions,
} from '@/components/static-asset/common';
import { RecordUtility } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, expect, mock, test } from 'bun:test';

// -----------------------------------------------------------------------------
// The token service: the signature before anything else, then the owner, then the expiry; every token that cannot be
// used answers alike, so the service is no oracle. The format is a codec the application can replace - the last
// suite plays an application that keeps a token format already in the wild, byte for byte.
// -----------------------------------------------------------------------------
interface IPayload {
  key: string;
  ownerId?: string;
  expiresAt: number;
}

const isPayload = (value: unknown): value is IPayload =>
  RecordUtility.isPlainRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.expiresAt === 'number';

const SECRET = 'test-secret-not-real';
const NOW = 1_700_000_000_000;
const INVALID = StaticAssetErrors.INVALID_COMMIT_TOKEN.message.code;
const EXPIRED = StaticAssetErrors.EXPIRED_COMMIT_TOKEN.message.code;

const build = (over: Partial<TAssetCommitTokenOptions<IPayload>> = {}) =>
  new AssetCommitToken<IPayload>({
    secretKey: SECRET,
    codec: AssetTokenCodecs.signedJson<IPayload>({ isPayload }),
    expiresAtOf: ({ payload }) => payload.expiresAt,
    ownerOf: ({ payload }) => payload.ownerId,
    now: () => NOW,
    ...over,
  });

const payload = (over: Partial<IPayload> = {}): IPayload => ({
  key: 'a/b.png',
  ownerId: 'u1',
  expiresAt: NOW + 60_000,
  ...over,
});

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    const normalized = RecordUtility.isRecord(error) ? error.normalized : undefined;

    return RecordUtility.isRecord(normalized) && typeof normalized.code === 'string'
      ? normalized.code
      : `thrown:${String(error)}`;
  }

  return undefined;
};

describe('signing and reading', () => {
  test('a signed payload comes back as it was, for the owner it was issued to', () => {
    const service = build();
    const token = service.sign({ payload: payload() });

    expect(service.verify({ token, ownerId: 'u1' })).toEqual(payload());
  });

  test('a changed payload or a changed signature is invalid, whichever half was touched', () => {
    const service = build();
    const [body, signature] = service.sign({ payload: payload() }).split('.');
    const forged = Buffer.from(JSON.stringify(payload({ key: 'other/b.png' }))).toString(
      'base64url',
    );
    const flipped = `${signature?.slice(0, -1)}${signature?.endsWith('A') ? 'B' : 'A'}`;

    for (const token of [
      `${forged}.${signature}`,
      `${body}.${flipped}`,
      `${body}.`,
      `.${signature}`,
    ]) {
      expect(codeOf(() => service.verify({ token, ownerId: 'u1' }))).toBe(INVALID);
    }
  });

  test('a token signed with another secret is invalid', () => {
    const token = build({ secretKey: 'another-secret' }).sign({ payload: payload() });

    expect(codeOf(() => build().verify({ token, ownerId: 'u1' }))).toBe(INVALID);
  });

  test('anything that is not a well-formed token is invalid and never throws another error', () => {
    const service = build();

    for (const token of [
      '',
      'a',
      'a.b.c',
      '.',
      'not a token',
      '..',
      'e30.e30',
      'x'.repeat(10_000),
    ]) {
      expect(codeOf(() => service.verify({ token, ownerId: 'u1' }))).toBe(INVALID);
    }

    expect(codeOf(() => service.verify({ token: undefined as never, ownerId: 'u1' }))).toBe(
      INVALID,
    );
  });

  test('a signed body that is not a payload of the application is invalid', () => {
    const service = build();
    const body = Buffer.from(JSON.stringify({ unrelated: true })).toString('base64url');
    const signature = createHmac('sha256', SECRET).update(body).digest('base64url');

    expect(codeOf(() => service.verify({ token: `${body}.${signature}`, ownerId: 'u1' }))).toBe(
      INVALID,
    );
  });

  test('a signed body of another shape never reaches the caller, even when its expiry would pass', () => {
    const service = build({ expiresAtOf: () => NOW + 1000 });
    const body = Buffer.from(JSON.stringify({ expiresAt: NOW + 1000, ownerId: 'u1' })).toString(
      'base64url',
    );
    const signature = createHmac('sha256', SECRET).update(body).digest('base64url');

    expect(codeOf(() => service.verify({ token: `${body}.${signature}`, ownerId: 'u1' }))).toBe(
      INVALID,
    );
  });

  test('a valid token with anything appended is invalid', () => {
    const service = build();
    const token = service.sign({ payload: payload() });

    for (const tail of ['.x', '.', '.e30.e30']) {
      expect(codeOf(() => service.verify({ token: `${token}${tail}`, ownerId: 'u1' }))).toBe(
        INVALID,
      );
    }
  });

  test('a service with no secret is refused, so nothing is ever signed with an empty key', () => {
    for (const secretKey of ['', '   ']) {
      expect(() => build({ secretKey })).toThrow('Invalid secretKey');
    }
  });
});

describe('the owner', () => {
  test('a token is for the owner it names: another owner, no owner given and a token with no owner are invalid', () => {
    const service = build();
    const token = service.sign({ payload: payload() });
    const noOwner = service.sign({ payload: payload({ ownerId: undefined }) });

    expect(codeOf(() => service.verify({ token, ownerId: 'u2' }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token, ownerId: '' }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token: noOwner, ownerId: 'u1' }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token: noOwner }))).toBe(INVALID);
  });

  test('an expired token of someone else is invalid, not expired: nothing is learned about a token that is not yours', () => {
    const service = build();
    const token = service.sign({ payload: payload({ expiresAt: NOW - 1 }) });

    expect(codeOf(() => service.verify({ token, ownerId: 'u2' }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token, ownerId: 'u1' }))).toBe(EXPIRED);
  });

  test('a service that binds no owner refuses an owner it was handed, because the check would silently not happen', () => {
    const service = build({ ownerOf: undefined });
    const token = service.sign({ payload: payload() });

    expect(service.verify({ token }).key).toBe('a/b.png');
    expect(codeOf(() => service.verify({ token, ownerId: 'u1' }))).toBe('core.system_error');
  });
});

describe('the expiry', () => {
  test('a token is good until its moment, and not at it', () => {
    const service = build();

    expect(
      service.verify({
        token: service.sign({ payload: payload({ expiresAt: NOW + 1 }) }),
        ownerId: 'u1',
      }).key,
    ).toBe('a/b.png');
    expect(
      codeOf(() =>
        service.verify({
          token: service.sign({ payload: payload({ expiresAt: NOW }) }),
          ownerId: 'u1',
        }),
      ),
    ).toBe(EXPIRED);
    expect(
      codeOf(() =>
        service.verify({
          token: service.sign({ payload: payload({ expiresAt: NOW - 1 }) }),
          ownerId: 'u1',
        }),
      ),
    ).toBe(EXPIRED);
  });

  test('a token whose moment cannot be read is invalid, not good forever', () => {
    const service = build({
      expiresAtOf: ({ payload: signed }) => (signed.key === 'x' ? undefined : Number.NaN),
    });

    for (const key of ['x', 'y']) {
      const token = service.sign({ payload: payload({ key }) });

      expect(codeOf(() => service.verify({ token, ownerId: 'u1' }))).toBe(INVALID);
    }

    const infinite = build({ expiresAtOf: () => Number.POSITIVE_INFINITY });
    expect(
      codeOf(() =>
        infinite.verify({ token: infinite.sign({ payload: payload() }), ownerId: 'u1' }),
      ),
    ).toBe(INVALID);
  });
});

describe('the application hook and the lists', () => {
  test('validate runs last, only on a genuine, owned and living token, and its own error reaches the caller', () => {
    const validate = mock(({ payload: signed }: { payload: IPayload }) => {
      if (signed.key.endsWith('.exe')) {
        throw getError({ message: 'unsupported extension' });
      }
    });
    const service = build({ validate });
    const exe = service.sign({ payload: payload({ key: 'x.exe' }) });
    const png = service.sign({ payload: payload() });

    expect(() => service.verify({ token: exe, ownerId: 'u1' })).toThrow('unsupported extension');
    expect(service.verify({ token: png, ownerId: 'u1' }).key).toBe('a/b.png');
    expect(codeOf(() => service.verify({ token: exe, ownerId: 'u2' }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token: 'junk', ownerId: 'u1' }))).toBe(INVALID);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  test('verifyMany returns every payload, or throws on the first bad token and returns nothing', () => {
    const service = build();
    const tokens = ['a', 'b', 'c'].map((key) => service.sign({ payload: payload({ key }) }));

    expect(service.verifyMany({ tokens, ownerId: 'u1' }).map((item) => item.key)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(service.verifyMany({ tokens: [], ownerId: 'u1' })).toEqual([]);
    expect(codeOf(() => service.verifyMany({ tokens: [...tokens, 'junk'], ownerId: 'u1' }))).toBe(
      INVALID,
    );
    expect(codeOf(() => service.verifyMany({ tokens, ownerId: 'u2' }))).toBe(INVALID);
  });

  test("the definitions are the application's to name", () => {
    const mine = { message: { text: 'no', code: 'app.token' }, statusCode: 418 };
    const service = build({ errors: { INVALID: mine, EXPIRED: mine } });
    const expired = service.sign({ payload: payload({ expiresAt: NOW - 1 }) });

    expect(codeOf(() => service.verify({ token: 'junk', ownerId: 'u1' }))).toBe('app.token');
    expect(codeOf(() => service.verify({ token: expired, ownerId: 'u1' }))).toBe('app.token');
  });
});

// -----------------------------------------------------------------------------
// An application with a token format already in the wild supplies its own codec and gets the same checks. This one plays
// BANA: `base64(JSON payload) + '.' + hex(HMAC-SHA256 of the JSON text)`, issued-at plus a ttl for the expiry, the owner
// inside the payload. The two tokens below were made by the code the application runs today.
// -----------------------------------------------------------------------------
interface ILegacyPayload {
  key: string;
  size: number;
  mime: string;
  ts: number;
  extension: string;
  resource?: string;
  ownerId?: string;
}

const LEGACY_SECRET = 'test-secret-not-real';
const LEGACY_TTL_MS = 360_000_000;
const LEGACY_OWNED =
  'eyJrZXkiOiIwYjZmMWMyZS0xMTExLTQyMjItODMzMy00NDQ0NTU1NTY2NjYucG5nIiwic2l6ZSI6MTIzNCwibWltZSI6ImltYWdlL3BuZyIsInRzIjoxNzAwMDAwMDAwMDAwLCJleHRlbnNpb24iOiIucG5nIiwicmVzb3VyY2UiOiJwcm9kdWN0Iiwib3duZXJJZCI6InVzZXItMSJ9.eea4ce377552e3eaaeea5272a0309c4981c487a14d898e93fef88daf6cd93411';
const LEGACY_UNOWNED =
  'eyJrZXkiOiJhLnhsc3giLCJzaXplIjoxLCJtaW1lIjoiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtIiwidHMiOjE3MDAwMDAwMDAwMDAsImV4dGVuc2lvbiI6Ii54bHN4In0=.0cd2f849180baaeaf8d5b42137d9e0196ad39060c21b5bab436399ce7612da76';
const LEGACY_PAYLOAD: ILegacyPayload = {
  key: '0b6f1c2e-1111-4222-8333-444455556666.png',
  size: 1234,
  mime: 'image/png',
  ts: 1_700_000_000_000,
  extension: '.png',
  resource: 'product',
  ownerId: 'user-1',
};

const isLegacyPayload = (value: unknown): value is ILegacyPayload =>
  RecordUtility.isPlainRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.ts === 'number';

const legacySign = (text: string) => createHmac('sha256', LEGACY_SECRET).update(text).digest('hex');

const legacyCodec: IAssetTokenCodec<ILegacyPayload> = {
  encode: ({ payload: signed, secretKey }) => {
    const text = JSON.stringify(signed);

    return `${Buffer.from(text).toString('base64')}.${createHmac('sha256', secretKey).update(text).digest('hex')}`;
  },
  decode: ({ token, secretKey }) => {
    const [encoded, signature] = token.split('.');

    if (!encoded || !signature) {
      return null;
    }

    const text = Buffer.from(encoded, 'base64').toString('utf8');
    const expected = Buffer.from(createHmac('sha256', secretKey).update(text).digest('hex'));
    const given = Buffer.from(signature);

    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(text);

      return isLegacyPayload(parsed) ? parsed : null;
      // eslint-disable-next-line venizia/no-silent-catch -- a signed body that is not JSON is the expected negative answer
    } catch {
      return null;
    }
  },
};

const legacyService = (opts: { now: number; extensions?: string[] }) =>
  new AssetCommitToken<ILegacyPayload>({
    secretKey: LEGACY_SECRET,
    codec: legacyCodec,
    // Expired once more than the ttl has passed since the token was issued: still good AT issued-at + ttl.
    expiresAtOf: ({ payload: signed }) => signed.ts + LEGACY_TTL_MS + 1,
    ownerOf: ({ payload: signed }) => signed.ownerId,
    validate: ({ payload: signed }) => {
      if (!(opts.extensions ?? ['.png', '.xlsx']).includes(signed.extension)) {
        throw getError({ message: 'unsupported extension' });
      }
    },
    now: () => opts.now,
  });

describe('an application that keeps its own token format', () => {
  test('signing writes the exact token the application issues today, byte for byte', () => {
    const service = legacyService({ now: LEGACY_PAYLOAD.ts });

    expect(service.sign({ payload: LEGACY_PAYLOAD })).toBe(LEGACY_OWNED);
    expect(legacySign(JSON.stringify(LEGACY_PAYLOAD))).toBe(LEGACY_OWNED.split('.')[1]!);
  });

  test('a token issued today verifies and gives back its whole payload', () => {
    const service = legacyService({ now: LEGACY_PAYLOAD.ts + 1000 });

    expect(service.verify({ token: LEGACY_OWNED, ownerId: 'user-1' })).toEqual(LEGACY_PAYLOAD);
  });

  test('the owner is still demanded: another owner, no owner and a token issued with none are refused', () => {
    const service = legacyService({ now: LEGACY_PAYLOAD.ts + 1000 });

    expect(codeOf(() => service.verify({ token: LEGACY_OWNED, ownerId: 'user-2' }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token: LEGACY_OWNED }))).toBe(INVALID);
    expect(codeOf(() => service.verify({ token: LEGACY_UNOWNED, ownerId: 'user-1' }))).toBe(
      INVALID,
    );
  });

  test('a tampered token and a token of another secret are refused', () => {
    const service = legacyService({ now: LEGACY_PAYLOAD.ts + 1000 });
    const [encoded, signature] = LEGACY_OWNED.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({ ...LEGACY_PAYLOAD, size: 999_999_999 }),
    ).toString('base64');

    expect(
      codeOf(() => service.verify({ token: `${tamperedBody}.${signature}`, ownerId: 'user-1' })),
    ).toBe(INVALID);
    expect(
      codeOf(() => service.verify({ token: `${encoded}.${'0'.repeat(64)}`, ownerId: 'user-1' })),
    ).toBe(INVALID);
    expect(
      codeOf(() =>
        service.verify({
          token: LEGACY_UNOWNED.split('.')[0] + '.' + signature,
          ownerId: 'user-1',
        }),
      ),
    ).toBe(INVALID);
  });

  test('the expiry is the old one: good through issued-at plus the ttl, expired a millisecond later', () => {
    const issuedAt = LEGACY_PAYLOAD.ts;

    expect(
      legacyService({ now: issuedAt + LEGACY_TTL_MS }).verify({
        token: LEGACY_OWNED,
        ownerId: 'user-1',
      }).key,
    ).toBe(LEGACY_PAYLOAD.key);
    expect(
      codeOf(() =>
        legacyService({ now: issuedAt + LEGACY_TTL_MS + 1 }).verify({
          token: LEGACY_OWNED,
          ownerId: 'user-1',
        }),
      ),
    ).toBe(EXPIRED);
  });

  test('the application checks of its own payload still run: an extension it does not take is refused', () => {
    const service = legacyService({ now: LEGACY_PAYLOAD.ts + 1000, extensions: ['.xlsx'] });

    expect(() => service.verify({ token: LEGACY_OWNED, ownerId: 'user-1' })).toThrow(
      'unsupported extension',
    );
  });
});
