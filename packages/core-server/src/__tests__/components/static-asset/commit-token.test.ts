import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { Hash, HashAlgorithms, HashOutputEncodings } from '@venizia/ignis-helpers';
import { StaticAssetCommitTokenUtility } from '@/components/static-asset/utilities';

const SECRET = 'a-secret-nobody-else-has';
const PAYLOAD = {
  bucket: { name: 'uploads' },
  object: { key: 'pending/2026/a.png' },
  expiresAt: Date.now() + 60_000,
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
  test('a token signed by the node:crypto implementation reads back, and a fresh one is the same text', () => {
    const KNOWN = {
      payload: { bucket: { name: 'b' }, object: { key: 'k/1' }, expiresAt: 4102444800000 },
      token:
        'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDB9.UmnVGQziar8C0fuxzivdH6SvX_5Q_5axiyTD2pu1v14',
    };

    expect(
      StaticAssetCommitTokenUtility.read({ token: KNOWN.token, secretKey: 'secret-key', now: 0 }),
    ).toEqual(KNOWN.payload);
    expect(
      StaticAssetCommitTokenUtility.build({ payload: KNOWN.payload, secretKey: 'secret-key' }),
    ).toBe(KNOWN.token);
  });

  test('a token with an owner keeps it, and the same text comes back', () => {
    const KNOWN = {
      payload: {
        bucket: { name: 'b' },
        object: { key: 'k/1' },
        expiresAt: 4102444800000,
        owner: 'user-7',
      },
      token:
        'eyJidWNrZXQiOnsibmFtZSI6ImIifSwib2JqZWN0Ijp7ImtleSI6ImsvMSJ9LCJleHBpcmVzQXQiOjQxMDI0NDQ4MDAwMDAsIm93bmVyIjoidXNlci03In0.msUXXcemZaj1HNI075ahpTZJa2OT-eBCxrvqiDQDG5M',
    };

    expect(
      StaticAssetCommitTokenUtility.read({ token: KNOWN.token, secretKey: 'secret-key', now: 0 }),
    ).toEqual(KNOWN.payload);
    expect(
      StaticAssetCommitTokenUtility.build({ payload: KNOWN.payload, secretKey: 'secret-key' }),
    ).toBe(KNOWN.token);
  });

  /** The shape before owners: `{ bucket: string, key, expiresAt }`. Its signature is still good, so only the shape check refuses it. */
  test('a token in the old shape no longer verifies', () => {
    const oldShape =
      'eyJidWNrZXQiOiJiIiwia2V5Ijoiay8xIiwiZXhwaXJlc0F0Ijo0MTAyNDQ0ODAwMDAwfQ.rDqsHgFcNylg-VS8Mbq_RWkg7eKER5YsqFU8pdJprpg';

    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: oldShape, secretKey: 'secret-key', now: 0 }),
    ).toThrow(/Invalid commit token/);
  });

  test('a signed body that is not a payload at all is refused as invalid', () => {
    const body = Buffer.from('"just a string"').toString('base64url');
    const signature = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
      message: body,
      secret: SECRET,
      opts: { outputEncoding: HashOutputEncodings.BASE64URL },
    });

    expect(() =>
      StaticAssetCommitTokenUtility.read({ token: `${body}.${signature}`, secretKey: SECRET }),
    ).toThrow(/Invalid commit token/);
  });
});
