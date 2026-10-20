import type { TConstValue } from '@venizia/ignis-helpers/common';

export class JOSEStandards {
  static readonly JWS = 'JWS';
  static readonly JWKS = 'JWKS';

  static readonly SCHEME_SET = new Set([this.JWS, this.JWKS]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJOSEStandard = TConstValue<typeof JOSEStandards>;

export class JWKSModes {
  static readonly ISSUER = 'issuer';
  static readonly VERIFIER = 'verifier';

  static readonly SCHEME_SET = new Set([this.ISSUER, this.VERIFIER]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJWKSMode = TConstValue<typeof JWKSModes>;

export class JWKSKeyDrivers {
  static readonly TEXT = 'text';
  static readonly FILE = 'file';

  static readonly SCHEME_SET = new Set([this.TEXT, this.FILE]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJWKSKeyDriver = TConstValue<typeof JWKSKeyDrivers>;

export class JWKSKeyFormats {
  static readonly PEM = 'pem';
  static readonly JWK = 'jwk';

  static readonly SCHEME_SET = new Set([this.PEM, this.JWK]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TJWKSKeyFormat = TConstValue<typeof JWKSKeyFormats>;
