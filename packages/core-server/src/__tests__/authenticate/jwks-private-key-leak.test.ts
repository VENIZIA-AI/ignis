import { describe, expect, test } from 'bun:test';
import { exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import { JWKSIssuerTokenService } from '@/components/auth/authenticate/services/bearer/jwks/issuer.service';

/**
 * `/certs` is served without authentication, so anything that reaches its document is public by
 * definition. The `jwk` key format could put a SIGNING key there.
 *
 * `importJWK` imports whatever it is handed, and a private JWK marked `"ext": true` yields an
 * extractable key - `exportJWK` then carries `d` into the served document. The `pem` format cannot
 * reach that state, because `importSPKI` rejects a private PEM outright.
 */

const assertPublicJWK = (jwk: JWK): void => {
  // Constructed without options: only the pure key-material guard is under test, and reaching it
  // through `initialize()` would need real files and a bound container.
  const service: JWKSIssuerTokenService = Object.create(JWKSIssuerTokenService.prototype);

  service['assertPublicJWK']({ jwk });
};

describe('a private key can never reach the JWKS document', () => {
  test('MEASURED: without the guard, a private JWK marked ext round-trips its `d`', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { extractable: true });
    const privateJwk = await exportJWK(privateKey);

    expect(privateJwk.d).toBeDefined();

    // This is the raw jose behaviour the guard exists to stop, asserted so the test explains itself
    // if jose ever changes it.
    const imported = await importJWK({ ...privateJwk, ext: true }, 'EdDSA');
    const exported = await exportJWK(imported);

    expect(exported.d).toBeDefined();
  });

  test('the guard refuses a private JWK where a public one belongs', async () => {
    const { privateKey } = await generateKeyPair('EdDSA', { extractable: true });
    const privateJwk = await exportJWK(privateKey);

    expect(() => assertPublicJWK(privateJwk)).toThrow(/PRIVATE members/);
  });

  test('the guard names the members it found, so the operator can see which field is wrong', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const privateJwk = await exportJWK(privateKey);

    let caught: unknown;

    try {
      assertPublicJWK(privateJwk);
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
    expect(() => assertPublicJWK(publicJwk)).not.toThrow();
  });

  test('a symmetric key is refused too - `k` is the whole secret', () => {
    expect(() => assertPublicJWK({ kty: 'oct', k: 'c2VjcmV0' })).toThrow(/PRIVATE members/);
  });
});
