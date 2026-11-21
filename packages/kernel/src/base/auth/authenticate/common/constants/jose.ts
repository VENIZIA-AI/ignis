import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** The token standards the JWT service can use: `JWS` (shared-secret signing) or `JWKS` (key-pair signing, published or fetched as a key set). */
export class JOSEStandards extends ConstClass {
  static readonly JWS = 'JWS';
  static readonly JWKS = 'JWKS';
}

/** A valid value of `JOSEStandards`. */
export type TJOSEStandard = TConstValue<typeof JOSEStandards>;

/** The role a JWKS setup plays: `issuer` signs tokens, `verifier` checks them against a remote key set. */
export class JWKSModes extends ConstClass {
  static readonly ISSUER = 'issuer';
  static readonly VERIFIER = 'verifier';
}

/** A valid value of `JWKSModes`. */
export type TJWKSMode = TConstValue<typeof JWKSModes>;

/** Where JWKS key material comes from: inline `text` content or a `file` path. */
export class JWKSKeyDrivers extends ConstClass {
  static readonly TEXT = 'text';
  static readonly FILE = 'file';
}

/** A valid value of `JWKSKeyDrivers`. */
export type TJWKSKeyDriver = TConstValue<typeof JWKSKeyDrivers>;

/** Encoding of JWKS key material: `pem` or `jwk`. */
export class JWKSKeyFormats extends ConstClass {
  static readonly PEM = 'pem';
  static readonly JWK = 'jwk';
}

/** A valid value of `JWKSKeyFormats`. */
export type TJWKSKeyFormat = TConstValue<typeof JWKSKeyFormats>;

/** The signing algorithms a JWKS issuer supports. */
export class JWKSAlgorithms extends ConstClass {
  static readonly ES256 = 'ES256';
  static readonly RS256 = 'RS256';
  static readonly EDDSA = 'EdDSA';
}

/** Valid JWKS algorithm values. */
export type TJWKSAlgorithm = TConstValue<typeof JWKSAlgorithms>;
