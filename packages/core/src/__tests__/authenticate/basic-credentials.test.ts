import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { BasicTokenService } from '@/components/auth/authenticate/services/basic/service';

/**
 * `extractCredentials` parses an attacker-controlled header. Two properties matter:
 * the parse must be exact (a password containing ':' is legal and must survive intact), and every
 * rejection must look IDENTICAL to the caller - a distinct message per failure mode turns the
 * endpoint into an oracle that tells the attacker which half of the credential it got right.
 */
const buildService = () => {
  return new BasicTokenService({ verifyCredentials: async () => ({ userId: 1 }) } as AnyType);
};

/** A context whose only job is to serve one Authorization header. */
const contextWith = (authorization?: string): AnyType => {
  return {
    req: { header: (name: string) => (name === 'Authorization' ? authorization : undefined) },
  };
};

const basic = (raw: string) => `Basic ${Buffer.from(raw, 'utf-8').toString('base64')}`;

describe('BasicTokenService.extractCredentials - parsing', () => {
  test('splits on the FIRST colon, so a password containing colons survives', () => {
    const credentials = buildService().extractCredentials(contextWith(basic('admin:pa:ss:word')));

    expect(credentials.username).toBe('admin');
    expect(credentials.password).toBe('pa:ss:word');
  });

  test('an EMPTY password is legal - only the username is required', () => {
    const credentials = buildService().extractCredentials(contextWith(basic('admin:')));

    expect(credentials.username).toBe('admin');
    expect(credentials.password).toBe('');
  });
});

describe('BasicTokenService.extractCredentials - every rejection looks the same', () => {
  const rejectionOf = (authorization?: string): { statusCode: number; message: string } => {
    try {
      buildService().extractCredentials(contextWith(authorization));
      return { statusCode: 0, message: 'DID NOT THROW' };
    } catch (error) {
      const { statusCode, message } = error as { statusCode: number; message: string };
      return { statusCode, message };
    }
  };

  test('a malformed payload never tells the caller WHICH part was wrong', () => {
    const noColon = rejectionOf(basic('adminpassword'));
    const emptyUsername = rejectionOf(basic(':secret'));

    expect(noColon.statusCode).toBe(401);
    expect(emptyUsername.statusCode).toBe(401);

    // The whole point: an attacker cannot tell "missing colon" from "empty username".
    expect(noColon.message).toBe(emptyUsername.message);
    expect(noColon.message).not.toContain('colon');
    expect(noColon.message).not.toContain('username');
  });

  test('a missing header and a wrong scheme are also 401', () => {
    expect(rejectionOf(undefined).statusCode).toBe(401);
    expect(rejectionOf('Bearer some.jwt.token').statusCode).toBe(401);
    expect(rejectionOf('Basic').statusCode).toBe(401);
  });
});
