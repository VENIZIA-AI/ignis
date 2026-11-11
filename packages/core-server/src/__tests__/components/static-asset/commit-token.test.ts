import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { Hash, HashAlgorithms, HashOutputEncodings } from '@venizia/ignis-helpers';
import {
  StaticAssetTokenStages,
  type IStaticAssetCommitTokenPayload,
} from '@/components/static-asset/common';
import { StaticAssetCommitTokenUtility } from '@/components/static-asset/utilities';

const SECRET = 'a-secret-nobody-else-has';
const PAYLOAD: IStaticAssetCommitTokenPayload = {
  bucket: { name: 'uploads' },
  object: { key: 'pending/2026/a.png' },
  expiresAt: Date.now() + 60_000,
  stage: StaticAssetTokenStages.ISSUED,
};
const PIN = { etag: '"5d41402abc4b2a76b9719d911017c592"', versionId: 'v-1' };

/** Signs whatever body it is given, so a test can mint a token the builder would never produce: the signature is good, only the shape is wrong. */
const signBody = (body: unknown): string => {
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
    message: encoded,
    secret: SECRET,
    opts: { outputEncoding: HashOutputEncodings.BASE64URL },
  });

  return `${encoded}.${signature}`;
};

describe('the commit token', () => {
  test('a token this secret signed reads back to what it signed', () => {
    const token = StaticAssetCommitTokenUtility.build({ payload: PAYLOAD, secretKey: SECRET });

    expect(StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET })).toEqual(PAYLOAD);
  });

  /** The whole point: a caller cannot name an object it was never granted a policy for. */
  test('a payload edited after signing is refused', () => {
    const token = StaticAssetCommitTokenUtility.build({ payload: PAYLOAD, secretKey: SECRET });
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...PAYLOAD, object: { key: 'invoices/2026/someone-elses.pdf' } }),
    ).toString('base64url');

    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: `${forged}.${signature}`, secretKey: SECRET }),
    ).toThrow();
  });

  test('another secret cannot mint one', () => {
    const token = StaticAssetCommitTokenUtility.build({
      payload: PAYLOAD,
      secretKey: 'some-other-secret',
    });

    expect(() => StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET })).toThrow();
  });

  test('a signature of a different length is refused, not crashed on', () => {
    const [body] = StaticAssetCommitTokenUtility.build({
      payload: PAYLOAD,
      secretKey: SECRET,
    }).split('.');

    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: `${body}.short`, secretKey: SECRET }),
    ).toThrow(/Invalid commit token/);
  });

  test('a token with no signature at all is refused', () => {
    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: 'no-dot-here', secretKey: SECRET }),
    ).toThrow(/Invalid commit token/);
  });

  test('an expired token is refused, and says so', () => {
    const token = StaticAssetCommitTokenUtility.build({
      payload: { ...PAYLOAD, expiresAt: Date.now() - 1 },
      secretKey: SECRET,
    });

    expect(() => StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET })).toThrow(
      /expired/i,
    );
  });

  /** Expiry is read from the payload, so a clock the caller does not control decides. */
  test('a token valid now is refused once the clock passes its expiry', () => {
    const token = StaticAssetCommitTokenUtility.build({ payload: PAYLOAD, secretKey: SECRET });

    expect(
      StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET, now: PAYLOAD.expiresAt - 1 }),
    ).toEqual(PAYLOAD);
    expect(() =>
      StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET, now: PAYLOAD.expiresAt + 1 }),
    ).toThrow(/expired/i);
  });
});

describe('the commit token needs a secret', () => {
  test('a missing or empty secret throws on build and on read, so no unkeyed signature is ever accepted', () => {
    const body = Buffer.from(JSON.stringify(PAYLOAD)).toString('base64url');
    const unkeyed = new Bun.CryptoHasher('sha256').update(body).digest('base64url');
    const forged = `${body}.${unkeyed}`;

    for (const secretKey of [undefined, null, '']) {
      expect(() =>
        StaticAssetCommitTokenUtility.build({
          payload: PAYLOAD,
          secretKey: secretKey as unknown as string,
        }),
      ).toThrow();
      expect(() =>
        StaticAssetCommitTokenUtility.read({
          token: forged,
          secretKey: secretKey as unknown as string,
        }),
      ).toThrow();
    }
  });
});

describe('the commit token keeps its format', () => {
  const BASE = { bucket: { name: 'b' }, object: { key: 'k/1' }, expiresAt: 4102444800000 };

  test('an issued token signed by the node:crypto implementation reads back, and a fresh one is the same text', () => {
    const KNOWN: { payload: IStaticAssetCommitTokenPayload; token: string } = {
      payload: { ...BASE, stage: StaticAssetTokenStages.ISSUED },
      token:
        'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDAsInN0YWdlIjoiaXNzdWVkIn0.Xcc2Nxvvg72JjpV63jfUYO5gDtIBi3kJ5_o6WbjLaFU',
    };

    expect(
      StaticAssetCommitTokenUtility.read({ token: KNOWN.token, secretKey: 'secret-key', now: 0 }),
    ).toEqual(KNOWN.payload);
    expect(
      StaticAssetCommitTokenUtility.build({ payload: KNOWN.payload, secretKey: 'secret-key' }),
    ).toBe(KNOWN.token);
  });

  test('an issued token with an owner keeps it, and the same text comes back', () => {
    const KNOWN: { payload: IStaticAssetCommitTokenPayload; token: string } = {
      payload: { ...BASE, owner: 'user-7', stage: StaticAssetTokenStages.ISSUED },
      token:
        'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDAsIm93bmVyIjoidXNlci03Iiwic3RhZ2UiOiJpc3N1ZWQifQ.PcbpWIBPxkIcIP766NNbewN3l7p7LalISExmtR-5u_E',
    };

    expect(
      StaticAssetCommitTokenUtility.read({ token: KNOWN.token, secretKey: 'secret-key', now: 0 }),
    ).toEqual(KNOWN.payload);
    expect(
      StaticAssetCommitTokenUtility.build({ payload: KNOWN.payload, secretKey: 'secret-key' }),
    ).toBe(KNOWN.token);
  });

  test('a validated token keeps its stage and its pin, and the same text comes back', () => {
    const KNOWN: { payload: IStaticAssetCommitTokenPayload; token: string } = {
      payload: {
        ...BASE,
        owner: 'user-7',
        stage: StaticAssetTokenStages.VALIDATED,
        pin: { etag: '"abc"', versionId: 'v-1' },
      },
      token:
        'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDAsIm93bmVyIjoidXNlci03Iiwic3RhZ2UiOiJ2YWxpZGF0ZWQiLCJwaW4iOnsiZXRhZyI6IlwiYWJjXCIiLCJ2ZXJzaW9uSWQiOiJ2LTEifX0.tHwZOYyaWJL5czJ3SP0W_Rc8t5YH9xa9cu1FsGz3LZE',
    };

    expect(
      StaticAssetCommitTokenUtility.read({ token: KNOWN.token, secretKey: 'secret-key', now: 0 }),
    ).toEqual(KNOWN.payload);
    expect(
      StaticAssetCommitTokenUtility.build({ payload: KNOWN.payload, secretKey: 'secret-key' }),
    ).toBe(KNOWN.token);
  });

  test('a validated token pinned by ETag alone has no version id', () => {
    const KNOWN: { payload: IStaticAssetCommitTokenPayload; token: string } = {
      payload: {
        ...BASE,
        stage: StaticAssetTokenStages.VALIDATED,
        pin: { etag: '"abc"' },
      },
      token:
        'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDAsInN0YWdlIjoidmFsaWRhdGVkIiwicGluIjp7ImV0YWciOiJcImFiY1wiIn19.L26I0ymHWxHvlHCzFt3toUADMpo269YEc5e-HRuUouk',
    };

    const read = StaticAssetCommitTokenUtility.read({
      token: KNOWN.token,
      secretKey: 'secret-key',
      now: 0,
    });

    expect(read).toEqual(KNOWN.payload);
    expect(read.pin?.versionId).toBeUndefined();
    expect(
      StaticAssetCommitTokenUtility.build({ payload: KNOWN.payload, secretKey: 'secret-key' }),
    ).toBe(KNOWN.token);
  });

  /** The shape before owners: `{ bucket: string, key, expiresAt }`. Its signature is still good, so only the shape check refuses it. */
  test('a token in the old shape no longer verifies', () => {
    const oldShape =
      'eyJidWNrZXQiOiJiIiwia2V5Ijoiay8xIiwiZXhwaXJlc0F0Ijo0MTAyNDQ4MDAwMDAwfQ.rDqsHgFcNylg-VS8Mbq_RWkg7eKER5YsqFU8pdJprpg';

    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: oldShape, secretKey: 'secret-key', now: 0 }),
    ).toThrow(/Invalid commit token/);
  });

  /** The shape before stages: a good signature and the right fields, but no `stage`. A token minted then must not slip through as issued. */
  test('a token minted before stages existed no longer verifies', () => {
    const beforeStages =
      'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDAsIm93bmVyIjoidXNlci03In0.msUXXcemZaj1HNI075ahpTZJa2OT-eBCxrvqiDQDG5M';

    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: beforeStages, secretKey: 'secret-key', now: 0 }),
    ).toThrow(/Invalid commit token/);
  });

  test('a signed body that is not a payload at all is refused as invalid', () => {
    const token = signBody('just a string');

    expect(() => StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET })).toThrow(
      /Invalid commit token/,
    );
  });
});

describe('the commit token stages', () => {
  const read = (token: string) => StaticAssetCommitTokenUtility.read({ token, secretKey: SECRET });

  test('an issued token carries no pin, even when the signed body had one', () => {
    const token = signBody({ ...PAYLOAD, pin: PIN });

    expect(read(token)).toEqual(PAYLOAD);
    expect(read(token).pin).toBeUndefined();
  });

  test('a validated token reads back with its pin', () => {
    const payload: IStaticAssetCommitTokenPayload = {
      ...PAYLOAD,
      stage: StaticAssetTokenStages.VALIDATED,
      pin: PIN,
    };
    const token = StaticAssetCommitTokenUtility.build({ payload, secretKey: SECRET });

    expect(read(token)).toEqual(payload);
  });

  test.each([
    ['no stage', { ...PAYLOAD, stage: undefined }],
    ['an unknown stage', { ...PAYLOAD, stage: 'approved' }],
    ['a stage that is not a string', { ...PAYLOAD, stage: 1 }],
    ['the validated stage without a pin', { ...PAYLOAD, stage: StaticAssetTokenStages.VALIDATED }],
    [
      'a validated stage whose pin has no ETag',
      { ...PAYLOAD, stage: StaticAssetTokenStages.VALIDATED, pin: { versionId: 'v-1' } },
    ],
    [
      'a validated stage whose ETag is not a string',
      { ...PAYLOAD, stage: StaticAssetTokenStages.VALIDATED, pin: { etag: 7 } },
    ],
    [
      'a validated stage whose version id is not a string',
      { ...PAYLOAD, stage: StaticAssetTokenStages.VALIDATED, pin: { etag: '"a"', versionId: 7 } },
    ],
    [
      'a validated stage whose pin is not an object',
      { ...PAYLOAD, stage: StaticAssetTokenStages.VALIDATED, pin: '"a"' },
    ],
  ])('a signed body with %s is refused as invalid', (_label, body) => {
    expect(() => read(signBody(body))).toThrow(/Invalid commit token/);
  });
});
