import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The token standards the JWT service can use: `JWS` (shared-secret signing) or `JWKS` (key-pair signing, published or fetched as a key set). */
export class JOSEStandards {
  static readonly JWS = 'JWS';
  static readonly JWKS = 'JWKS';

  static readonly SCHEME_SET = new Set([this.JWS, this.JWKS]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

/** A valid value of `JOSEStandards`. */
export type TJOSEStandard = TConstValue<typeof JOSEStandards>;

/** The role a JWKS setup plays: `issuer` signs tokens, `verifier` checks them against a remote key set. */
export class JWKSModes {
  static readonly ISSUER = 'issuer';
  static readonly VERIFIER = 'verifier';

  static readonly SCHEME_SET = new Set([this.ISSUER, this.VERIFIER]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

/** A valid value of `JWKSModes`. */
export type TJWKSMode = TConstValue<typeof JWKSModes>;

/** Where JWKS key material comes from: inline `text` content or a `file` path. */
export class JWKSKeyDrivers {
  static readonly TEXT = 'text';
  static readonly FILE = 'file';

  static readonly SCHEME_SET = new Set([this.TEXT, this.FILE]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

/** A valid value of `JWKSKeyDrivers`. */
export type TJWKSKeyDriver = TConstValue<typeof JWKSKeyDrivers>;

/** Encoding of JWKS key material: `pem` or `jwk`. */
export class JWKSKeyFormats {
  static readonly PEM = 'pem';
  static readonly JWK = 'jwk';

  static readonly SCHEME_SET = new Set([this.PEM, this.JWK]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

/** A valid value of `JWKSKeyFormats`. */
export type TJWKSKeyFormat = TConstValue<typeof JWKSKeyFormats>;

/** The signing algorithms a JWKS issuer supports. */
export class JWKSAlgorithms {
  static readonly ES256 = 'ES256';
  static readonly RS256 = 'RS256';
  static readonly EDDSA = 'EdDSA';

  static readonly SCHEME_SET = new Set<string>([this.ES256, this.RS256, this.EDDSA]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid JWKS algorithm values. */
export type TJWKSAlgorithm = TConstValue<typeof JWKSAlgorithms>;
