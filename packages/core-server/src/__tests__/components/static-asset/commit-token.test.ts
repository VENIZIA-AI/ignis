import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { buildCommitToken, readCommitToken } from '@/components/static-asset/common';

const SECRET = 'a-secret-nobody-else-has';
const PAYLOAD = { bucket: 'uploads', key: 'pending/2026/a.png', expiresAt: Date.now() + 60_000 };

describe('the commit token', () => {
  test('a token this secret signed reads back to what it signed', () => {
    const token = buildCommitToken({ payload: PAYLOAD, secretKey: SECRET });

    expect(readCommitToken({ token, secretKey: SECRET })).toEqual(PAYLOAD);
  });

  /** The whole point: a caller cannot name an object it was never granted a policy for. */
  test('a payload edited after signing is refused', () => {
    const token = buildCommitToken({ payload: PAYLOAD, secretKey: SECRET });
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...PAYLOAD, key: 'invoices/2026/someone-elses.pdf' }),
    ).toString('base64url');

    expect(() => readCommitToken({ token: `${forged}.${signature}`, secretKey: SECRET })).toThrow();
  });

  test('another secret cannot mint one', () => {
    const token = buildCommitToken({ payload: PAYLOAD, secretKey: 'some-other-secret' });

    expect(() => readCommitToken({ token, secretKey: SECRET })).toThrow();
  });

  test('a signature of a different length is refused, not crashed on', () => {
    const [body] = buildCommitToken({ payload: PAYLOAD, secretKey: SECRET }).split('.');

    expect(() => readCommitToken({ token: `${body}.short`, secretKey: SECRET })).toThrow(
      /Invalid commit token/,
    );
  });

  test('a token with no signature at all is refused', () => {
    expect(() => readCommitToken({ token: 'no-dot-here', secretKey: SECRET })).toThrow(
      /Invalid commit token/,
    );
  });

  test('an expired token is refused, and says so', () => {
    const token = buildCommitToken({
      payload: { ...PAYLOAD, expiresAt: Date.now() - 1 },
      secretKey: SECRET,
    });

    expect(() => readCommitToken({ token, secretKey: SECRET })).toThrow(/expired/i);
  });

  /** Expiry is read from the payload, so a clock the caller does not control decides. */
  test('a token valid now is refused once the clock passes its expiry', () => {
    const token = buildCommitToken({ payload: PAYLOAD, secretKey: SECRET });

    expect(readCommitToken({ token, secretKey: SECRET, now: PAYLOAD.expiresAt - 1 })).toEqual(
      PAYLOAD,
    );
    expect(() => readCommitToken({ token, secretKey: SECRET, now: PAYLOAD.expiresAt + 1 })).toThrow(
      /expired/i,
    );
  });
});
