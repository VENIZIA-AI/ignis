import { describe, expect, test } from 'bun:test';
import { HTTP } from '@venizia/ignis-helpers/common';
import { SignJWT } from 'jose';
import { JWSTokenService } from '@/components/auth';

const JWT_SECRET = 'jwt-secret-that-is-long-enough-for-hs256';
const APPLICATION_SECRET = '0123456789abcdef0123456789abcdef';

const service = new JWSTokenService({
  jwtSecret: JWT_SECRET,
  getTokenExpiresFn: () => 3600,
  claims: { issuer: 'test-issuer', audience: 'test-audience' },
  applicationSecret: APPLICATION_SECRET,
});

/** A token signed with the service's own secret around the given claims, as an issuer other than `generate` would write it. */
const sign = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('test-issuer')
    .setAudience('test-audience')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));

const refusal = async (task: Promise<unknown>) => {
  try {
    await task;
  } catch (error) {
    return error;
  }

  throw new Error('expected the token to be refused');
};

/** `verify` wraps every refusal as one 401; the reason is its cause. */
const causeOf = (error: unknown): string => {
  const cause: unknown = Reflect.get(Object(error), 'cause');

  return String(Reflect.get(Object(cause), 'message'));
};

describe('decryptPayload refuses a token it did not issue', () => {
  test('an encrypted claim that is not a string is a 401', async () => {
    const encrypted = await service.encryptPayload({ userId: 1, name: 'ada' });
    const [, [nameKey]] = Object.entries(encrypted);
    const token = await sign({ [nameKey]: 123 });

    const error = await refusal(service.verify({ type: 'Bearer', token }));

    expect(Reflect.get(Object(error), 'statusCode')).toBe(HTTP.ResultCodes.RS_4.Unauthorized);
    expect(causeOf(error)).toContain('is not a string');
  });

  test('decrypted claims without a userId are a 401', async () => {
    const encrypted = await service.encryptPayload({ userId: 1, name: 'ada' });
    const withoutUser = Object.fromEntries(Object.entries(encrypted).slice(1));
    const token = await sign(withoutUser);

    const error = await refusal(service.verify({ type: 'Bearer', token }));

    expect(Reflect.get(Object(error), 'statusCode')).toBe(HTTP.ResultCodes.RS_4.Unauthorized);
    expect(causeOf(error)).toContain('carry no userId');
  });

  test('a token this service issued still decodes, userId and all', async () => {
    const token = await service.generate({ payload: { userId: 7, name: 'ada' } });
    const payload = await service.verify({ type: 'Bearer', token });

    expect(payload.userId).toBe(7);
    expect(payload.name).toBe('ada');
  });
});
