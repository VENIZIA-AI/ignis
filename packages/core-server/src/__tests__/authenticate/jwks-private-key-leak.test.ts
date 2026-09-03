import { describe, expect, test } from 'bun:test';
import { exportJWK, generateKeyPair, importJWK } from 'jose';
import { JWKSIssuerTokenService } from '@/components/auth/authenticate/services/bearer/jwks/issuer.service';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * `/certs` is served without authentication, so anything that reaches its document is public by
 * definition. The `jwk` key format could put a SIGNING key there.
 *
 * `importJWK` imports whatever it is handed, and a private JWK marked `"ext": true` yields an
 * extractable key - `exportJWK` then carries `d` into the served document. The `pem` format cannot
 * reach that state, because `importSPKI` rejects a private PEM outright.
 */

const buildService = (): AnyType => {
  // Constructed without options: only the pure key-material guard is under test, and reaching it
  // through `initialize()` would need real files and a bound container.
  return Object.create(JWKSIssuerTokenService.prototype) as AnyType;
};

describe('a private key can never reach the JWKS document', () => {
  test('MEASURED: without the guard, a private JWK marked ext round-trips its `d`', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { extractable: true });
    const privateJwk = await exportJWK(privateKey);

    expect(privateJwk.d).toBeDefined();

    // This is the raw jose behaviour the guard exists to stop, asserted so the test explains itself
    // if jose ever changes it.
    const imported = await importJWK({ ...privateJwk, ext: true } as AnyType, 'EdDSA');
    const exported = await exportJWK(imported as AnyType);

    expect(exported.d).toBeDefined();
  });

  test('the guard refuses a private JWK where a public one belongs', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { extractable: true });
    const privateJwk = await exportJWK(privateKey);

    expect(() => buildService().assertPublicJWK({ jwk: privateJwk })).toThrow(/PRIVATE members/);
  });

  test('the guard names the members it found, so the operator can see which field is wrong', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const privateJwk = await exportJWK(privateKey);

    let caught: AnyType;
    try {
      buildService().assertPublicJWK({ jwk: privateJwk });
    } catch (error) {
      caught = error;
    }

    // RSA private material is `d` plus the CRT members; a guard that only knew `d` would still be
    // correct here, but the message should show everything it saw.
    expect(String(caught)).toMatch(/\bd\b/);
    expect(String(caught)).toMatch(/keys\.public/);
  });

  test('a genuine public JWK passes untouched', async () => {
    const { publicKey } = await generateKeyPair('EdDSA', { extractable: true });
    const publicJwk = await exportJWK(publicKey);

    expect(publicJwk.d).toBeUndefined();
    expect(() => buildService().assertPublicJWK({ jwk: publicJwk })).not.toThrow();
  });

  test('a symmetric key is refused too - `k` is the whole secret', () => {
    expect(() => buildService().assertPublicJWK({ jwk: { kty: 'oct', k: 'c2VjcmV0' } })).toThrow(
      /PRIVATE members/,
    );
  });
});
