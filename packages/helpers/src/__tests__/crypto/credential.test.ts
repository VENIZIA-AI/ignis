import { describe, expect, test } from 'bun:test';
import { CredentialHelper } from '@/modules/crypto';
import { Rejection } from './rejection';

/**
 * Hashes written by the `bcrypt` package 6.0.0 (cost 4), kept as fixtures so the helper is proven against
 * what already sits in a database, not only against its own output. Each was accepted by the package itself
 * when it was generated.
 */
const FROM_BCRYPT_PACKAGE = {
  short2b: '$2b$04$o1ZnnGCLhn8hD75dRWP0.uSLZZVqVLDJXUhSb/Vd9h2YdUZLeXTfq',
  short2a: '$2a$04$2/Uxt/2iFomSTD4MSfJGFelN1ZxSLOS1EBBkDoP7ZMB/2s2aZwjWu',
  long2b: '$2b$04$sPtsB76Pb9KtFQAaSNd2ReNoq3roIC0DFeM4X2m5A4WgT0PMUOk6q',
  long2a: '$2a$04$hvG07TTm5S3QSE0jlqH5JuA6iY/V62sHhXtcZ/cS2VKczWZBmTI3m',
  utf8Long: '$2b$04$K34BylTqh7kmBL4y90dsS.UCrom1HzEXkM0Z03iy1TjOxce/H4icG',
  split72: '$2b$04$NaiY0vTJvBZnF5s34brp4Ol/8xx5kMWz9zUeYle32DYPoXbzWfoeu',
  exact72: '$2b$04$Vqh2mNtnrWgH01ZTp/PnNeclGcVy1LGG7Typrr.oWKentfrT/cV.u',
};
// "hunter2" hashed by Bun.password with argon2id: a stored format that is not bcrypt
const ARGON2 =
  '$argon2id$v=19$m=1024,t=1,p=1$lQPR0060pxQb8ak/JAka8taGZh5mHOX8FF2hCG81SJI$T8+N2rklcECgYbgynSnOgMLriechjoXZCz53O/HSTh4';

const LONG = 'p'.repeat(100);

/** `verify` gives `expected` for each case, one after the other. */
const expectVerify = async (cases: { password: unknown; hash: unknown; expected: boolean }[]) => {
  for (const { password, hash, expected } of cases) {
    const result = await CredentialHelper.verify({
      password: password as string,
      hash: hash as string,
    });

    expect(result).toBe(expected);
  }
};

describe('CredentialHelper.hash - argon2id by default', () => {
  test('the default is argon2id with the parameters Bun.password uses by default', async () => {
    const hash = await CredentialHelper.hash({ password: 'hunter2' });
    const reference = await Bun.password.hash('hunter2');

    expect(hash).toStartWith('$argon2id$');
    // The parameter block ("v=19$m=65536,t=2,p=1") is the same as Bun's own default output.
    expect(hash.split('$').slice(1, 4)).toEqual(reference.split('$').slice(1, 4));
  });

  test('saying argon2id is the same as saying nothing', async () => {
    const hash = await CredentialHelper.hash({ password: 'hunter2', algorithm: 'argon2id' });

    expect(hash).toStartWith('$argon2id$v=19$m=65536,t=2,p=1$');
  });

  test('a hash verifies, and the salt differs every time', async () => {
    const a = await CredentialHelper.hash({ password: 'hunter2' });
    const b = await CredentialHelper.hash({ password: 'hunter2' });

    expect(a).not.toBe(b);

    return expectVerify([
      { password: 'hunter2', hash: a, expected: true },
      { password: 'hunter2', hash: b, expected: true },
      { password: 'hunter3', hash: a, expected: false },
    ]);
  });

  test('a password over 72 bytes is read in full: argon2id has no 72-byte limit', async () => {
    const hash = await CredentialHelper.hash({ password: LONG });

    return expectVerify([
      { password: LONG, hash, expected: true },
      { password: LONG.slice(0, 72), hash, expected: false },
      { password: `${LONG}x`, hash, expected: false },
    ]);
  });

  test('a cost with argon2id is refused, by default or by name, and the message says how to keep bcrypt', async () => {
    const byDefault = await Rejection.messageOf({
      promise: CredentialHelper.hash({ password: 'hunter2', cost: 10 }),
    });
    const byName = await Rejection.messageOf({
      promise: CredentialHelper.hash({ password: 'hunter2', algorithm: 'argon2id', cost: 10 }),
    });

    expect(byDefault).toContain('cost applies to bcrypt only');
    expect(byDefault).toContain("algorithm: 'bcrypt'");
    expect(byName).toBe(byDefault);
  });

  test.each([0, -1, Number.NaN])('a cost of %p with argon2id is refused too', async (cost) => {
    const message = await Rejection.messageOf({
      promise: CredentialHelper.hash({ password: 'hunter2', cost }),
    });

    expect(message).toContain('cost applies to bcrypt only');
  });

  test('a cost of null or undefined is "no cost": argon2id and bcrypt both take their defaults', async () => {
    const argon = await CredentialHelper.hash({
      password: 'hunter2',
      cost: null as unknown as undefined,
    });
    const bcrypt = await CredentialHelper.hash({
      password: 'hunter2',
      algorithm: 'bcrypt',
      cost: null as unknown as undefined,
    });

    expect(argon).toStartWith('$argon2id$');
    expect(bcrypt).toStartWith('$2b$10$');
  });

  test.each(['scrypt', 'argon2i', 'BCRYPT', '', null, 7])(
    'an algorithm of %p is refused',
    async (algorithm) => {
      const message = await Rejection.messageOf({
        promise: CredentialHelper.hash({
          password: 'hunter2',
          algorithm: algorithm as unknown as 'bcrypt',
        }),
      });

      expect(message).toContain('Invalid algorithm');
    },
  );

  test.each(['', undefined, null, 123, {}])('a password of %p is refused', async (password) => {
    const message = await Rejection.messageOf({
      promise: CredentialHelper.hash({ password: password as unknown as string }),
    });

    expect(message).toContain('Invalid password');
  });
});

describe('CredentialHelper.hash - bcrypt on request', () => {
  test('writes a 60-character bcrypt hash that verifies, with a different salt every time', async () => {
    const a = await CredentialHelper.hash({ password: 'hunter2', algorithm: 'bcrypt', cost: 4 });
    const b = await CredentialHelper.hash({ password: 'hunter2', algorithm: 'bcrypt', cost: 4 });

    expect(a).toMatch(/^\$2b\$04\$/);
    expect(a).toHaveLength(60);
    expect(a).not.toBe(b);

    return expectVerify([{ password: 'hunter2', hash: a, expected: true }]);
  });

  test('the default bcrypt cost is 10', async () => {
    const hash = await CredentialHelper.hash({ password: 'hunter2', algorithm: 'bcrypt' });

    expect(hash).toStartWith('$2b$10$');
  });

  test.each([3, 32, 4.5, Number.NaN])('a cost of %p is refused', async (cost) => {
    const message = await Rejection.messageOf({
      promise: CredentialHelper.hash({
        password: 'hunter2',
        algorithm: 'bcrypt',
        cost: cost as unknown as number,
      }),
    });

    expect(message).toContain('Invalid cost');
  });

  test('a bcrypt hash written on request is read back, over 72 bytes too', async () => {
    const hash = await CredentialHelper.hash({
      password: LONG,
      algorithm: 'bcrypt',
      cost: 4,
    });

    return expectVerify([{ password: LONG, hash, expected: true }]);
  });
});

describe('CredentialHelper.verify - hashes written by the bcrypt package are read, never rehashed', () => {
  test.each(['short2b', 'short2a'] as const)(
    '%s verifies, and a wrong password does not',
    (key) => {
      const hash = FROM_BCRYPT_PACKAGE[key];

      return expectVerify([
        { password: 'hunter2', hash, expected: true },
        { password: 'hunter3', hash, expected: false },
      ]);
    },
  );

  test.each(['long2b', 'long2a'] as const)(
    'a password longer than 72 bytes verifies against the %s hash the package wrote for it',
    (key) => {
      return expectVerify([{ password: LONG, hash: FROM_BCRYPT_PACKAGE[key], expected: true }]);
    },
  );

  test('a multibyte password longer than 72 bytes verifies, and so does one cut inside a character at byte 72', () => {
    return expectVerify([
      { password: 'é'.repeat(50), hash: FROM_BCRYPT_PACKAGE.utf8Long, expected: true },
      {
        password: `${'a'.repeat(71)}étail`,
        hash: FROM_BCRYPT_PACKAGE.split72,
        expected: true,
      },
    ]);
  });

  test('control: Bun.password alone does not read the long ones, which is why the retry exists', () => {
    return expect(Bun.password.verify(LONG, FROM_BCRYPT_PACKAGE.long2b)).resolves.toBe(false);
  });

  test('a different first 72 bytes still fails', () => {
    return expectVerify([
      { password: `x${'p'.repeat(99)}`, hash: FROM_BCRYPT_PACKAGE.long2b, expected: false },
    ]);
  });

  test('the boundary: 72 bytes verify, and 73 bytes with the same 72 are read the way bcrypt reads them', () => {
    const hash = FROM_BCRYPT_PACKAGE.exact72;

    return expectVerify([
      { password: 'q'.repeat(72), hash, expected: true },
      { password: 'q'.repeat(73), hash, expected: true },
      { password: 'q'.repeat(71), hash, expected: false },
    ]);
  });
});

describe('CredentialHelper.verify - a hash the helper wrote for a long password never needs the retry', () => {
  test('it verifies on the first attempt, and its 72-byte prefix and a sibling with that prefix do not', async () => {
    const long = `${'a'.repeat(72)}tail-one`;
    const hash = await CredentialHelper.hash({ password: long, algorithm: 'bcrypt', cost: 4 });

    const direct = await Bun.password.verify(long, hash);

    expect(direct).toBe(true);
    await expectVerify([
      { password: long, hash, expected: true },
      { password: 'a'.repeat(72), hash, expected: false },
      { password: `${'a'.repeat(72)}tail-two`, hash, expected: false },
    ]);
  });
});

describe('CredentialHelper.verify - what is not bcrypt, and what is not a hash', () => {
  test('an argon2 hash is read by Bun, and a wrong long password is false', () => {
    return expectVerify([
      { password: 'hunter2', hash: ARGON2, expected: true },
      { password: `hunter2${'x'.repeat(80)}`, hash: ARGON2, expected: false },
    ]);
  });

  test('nothing to match is false: an empty or non-string password, an empty or non-string hash', () => {
    const hash = FROM_BCRYPT_PACKAGE.short2b;

    return expectVerify([
      { password: '', hash, expected: false },
      { password: 123, hash, expected: false },
      { password: 'hunter2', hash: '', expected: false },
      { password: 'hunter2', hash: null, expected: false },
    ]);
  });

  test('a stored value that is not a password hash is a 500 and does not repeat the runtime message', async () => {
    let error: unknown;

    try {
      await CredentialHelper.verify({ password: 'hunter2', hash: 'garbage' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { statusCode?: number }).statusCode).toBe(500);
    expect((error as Error).message).toContain('Invalid hash');
    expect((error as Error).message).not.toContain('UnsupportedAlgorithm');
    expect((error as Error).cause).toBeDefined();
  });
});
