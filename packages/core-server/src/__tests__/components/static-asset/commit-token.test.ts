import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { AssetCommitToken } from '@/components/static-asset/common';

const SECRET = 'a-secret-nobody-else-has';
const PAYLOAD = { bucket: 'uploads', key: 'pending/2026/a.png', expiresAt: Date.now() + 60_000 };

describe('the commit token', () => {
  test('a token this secret signed reads back to what it signed', () => {
    const token = AssetCommitToken.build({ payload: PAYLOAD, secretKey: SECRET });

    expect(AssetCommitToken.read({ token, secretKey: SECRET })).toEqual(PAYLOAD);
  });

  /** The whole point: a caller cannot name an object it was never granted a policy for. */
  test('a payload edited after signing is refused', () => {
    const token = AssetCommitToken.build({ payload: PAYLOAD, secretKey: SECRET });
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...PAYLOAD, key: 'invoices/2026/someone-elses.pdf' }),
    ).toString('base64url');

    expect(() =>
      AssetCommitToken.read({ token: `${forged}.${signature}`, secretKey: SECRET }),
    ).toThrow();
  });

  test('another secret cannot mint one', () => {
    const token = AssetCommitToken.build({ payload: PAYLOAD, secretKey: 'some-other-secret' });

    expect(() => AssetCommitToken.read({ token, secretKey: SECRET })).toThrow();
  });

  test('a signature of a different length is refused, not crashed on', () => {
    const [body] = AssetCommitToken.build({ payload: PAYLOAD, secretKey: SECRET }).split('.');

    expect(() => AssetCommitToken.read({ token: `${body}.short`, secretKey: SECRET })).toThrow(
      /Invalid commit token/,
    );
  });

  test('a token with no signature at all is refused', () => {
    expect(() => AssetCommitToken.read({ token: 'no-dot-here', secretKey: SECRET })).toThrow(
      /Invalid commit token/,
    );
  });

  test('an expired token is refused, and says so', () => {
    const token = AssetCommitToken.build({
      payload: { ...PAYLOAD, expiresAt: Date.now() - 1 },
      secretKey: SECRET,
    });

    expect(() => AssetCommitToken.read({ token, secretKey: SECRET })).toThrow(/expired/i);
  });

  /** Expiry is read from the payload, so a clock the caller does not control decides. */
  test('a token valid now is refused once the clock passes its expiry', () => {
    const token = AssetCommitToken.build({ payload: PAYLOAD, secretKey: SECRET });

    expect(AssetCommitToken.read({ token, secretKey: SECRET, now: PAYLOAD.expiresAt - 1 })).toEqual(
      PAYLOAD,
    );
    expect(() =>
      AssetCommitToken.read({ token, secretKey: SECRET, now: PAYLOAD.expiresAt + 1 }),
    ).toThrow(/expired/i);
  });
});

describe('the commit token needs a secret', () => {
  test('a missing secret throws on build and on read, so no unkeyed signature is ever accepted', () => {
    const body = Buffer.from(JSON.stringify(PAYLOAD)).toString('base64url');
    const unkeyed = new Bun.CryptoHasher('sha256').update(body).digest('base64url');
    const forged = `${body}.${unkeyed}`;

    for (const secretKey of [undefined, null]) {
      expect(() =>
        AssetCommitToken.build({ payload: PAYLOAD, secretKey: secretKey as unknown as string }),
      ).toThrow();
      expect(() =>
        AssetCommitToken.read({ token: forged, secretKey: secretKey as unknown as string }),
      ).toThrow();
    }
  });
});

describe('the commit token keeps its format', () => {
  test('a token signed by the node:crypto implementation reads back, and a fresh one is the same text', () => {
    const KNOWN = {
      payload: { bucket: 'b', key: 'k/1', expiresAt: 4102444800000 },
      token:
        'eyJidWNrZXQiOiJiIiwia2V5Ijoiay8xIiwiZXhwaXJlc0F0Ijo0MTAyNDQ0ODAwMDAwfQ.rDqsHgFcNylg-VS8Mbq_RWkg7eKER5YsqFU8pdJprpg',
    };

    expect(AssetCommitToken.read({ token: KNOWN.token, secretKey: 'secret-key', now: 0 })).toEqual(
      KNOWN.payload,
    );
    expect(AssetCommitToken.build({ payload: KNOWN.payload, secretKey: 'secret-key' })).toBe(
      KNOWN.token,
    );
  });
});
