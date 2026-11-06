import { describe, expect, test } from 'bun:test';
import type { IJWSTokenServiceOptions, IJWTTokenPayload } from '@/components/auth';
import { JWSTokenService } from '@/components/auth';

const JWT_SECRET = 'jwt-secret-that-is-long-enough-for-hs256';
const APPLICATION_SECRET = '0123456789abcdef0123456789abcdef';

const buildService = (opts: {
  encrypted: boolean;
  fieldCodecs?: IJWSTokenServiceOptions['fieldCodecs'];
}) => {
  return new JWSTokenService({
    jwtSecret: JWT_SECRET,
    getTokenExpiresFn: () => 3600,
    ...(opts.encrypted ? { applicationSecret: APPLICATION_SECRET } : {}),
    ...(opts.fieldCodecs ? { fieldCodecs: opts.fieldCodecs } : {}),
  } as IJWSTokenServiceOptions);
};

/** The claims that vary per token and have nothing to do with the payload under test. */
const withoutTimeClaims = (payload: IJWTTokenPayload): Record<string, unknown> => {
  const { iat: _iat, exp: _exp, nbf: _nbf, ...rest } = payload;

  return rest;
};

const roundTrip = async (opts: { service: JWSTokenService; payload: Record<string, unknown> }) => {
  const token = await opts.service.generate({ payload: opts.payload as IJWTTokenPayload });
  const verified = await opts.service.verify({ type: 'Bearer', token });

  return withoutTimeClaims(verified);
};

const PAYLOAD = {
  userId: 42,
  someId: null,
  nested: { a: null, b: [1, null, 'x'], c: { d: true } },
  list: [null, 2],
  note: 'text',
  count: 0,
  flag: false,
  empty: '',
};

describe('bearer payload - null claims (#943)', () => {
  test('with encryption on, a null claim survives the round trip as null, key present', async () => {
    const decoded = await roundTrip({
      service: buildService({ encrypted: true }),
      payload: PAYLOAD,
    });

    expect('someId' in decoded).toBe(true);
    expect(decoded.someId).toBeNull();
    expect(decoded.nested).toEqual(PAYLOAD.nested);
  });

  test('an undefined claim is absent, with encryption on and off', async () => {
    for (const encrypted of [true, false]) {
      const decoded = await roundTrip({
        service: buildService({ encrypted }),
        payload: { userId: 42, gone: undefined, kept: null },
      });

      expect('gone' in decoded).toBe(false);
      expect(decoded.kept).toBeNull();
    }
  });

  test('encrypted and plain mode decode the same payload to the same object', async () => {
    const encrypted = await roundTrip({
      service: buildService({ encrypted: true }),
      payload: PAYLOAD,
    });
    const plain = await roundTrip({
      service: buildService({ encrypted: false }),
      payload: PAYLOAD,
    });

    expect(encrypted).toEqual(plain);
    expect(encrypted).toEqual(PAYLOAD);
  });

  test('null null-vs-absent can be told apart: a token without the claim decodes without the key', async () => {
    const service = buildService({ encrypted: true });
    const withNull = await roundTrip({ service, payload: { userId: 1, someId: null } });
    const without = await roundTrip({ service, payload: { userId: 1 } });

    expect('someId' in withNull).toBe(true);
    expect('someId' in without).toBe(false);
  });

  test('a null never reaches a field codec, so a codec that cannot take null does not throw', async () => {
    const calls: string[] = [];
    const service = buildService({
      encrypted: true,
      fieldCodecs: [
        {
          key: 'when',
          serialize: ({ value }: { value: unknown }) => {
            calls.push('serialize');

            return (value as Date).toISOString();
          },
          deserialize: ({ raw }: { raw: string }) => {
            calls.push('deserialize');

            return new Date(raw);
          },
        },
      ],
    });

    const nullDecoded = await roundTrip({ service, payload: { userId: 1, when: null } });

    expect(nullDecoded.when).toBeNull();
    expect(calls).toEqual([]);

    const at = new Date('2026-11-06T00:00:00.000Z');
    const dateDecoded = await roundTrip({ service, payload: { userId: 1, when: at } });

    expect(dateDecoded.when).toEqual(at);
    expect(calls).toEqual(['serialize', 'deserialize']);
  });
});
