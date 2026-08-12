import type { TContext } from '@/base/controllers/common/types';
import type { IdType } from '@/base/models/common/types';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { AnyObject, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { AESAlgorithmType, IPayloadCipher } from '@venizia/ignis-helpers';
import type { Env } from 'hono';
import { type MiddlewareHandler } from 'hono';
import type { JWTPayload } from 'jose';
import type { TChangePasswordRequest, TSignInRequest, TSignUpRequest } from '../../models/requests';
import type { JOSEStandards, JWKSModes } from './constants';
import { type TAuthMode, type TJWKSKeyDriver, type TJWKSKeyFormat } from './constants';

export type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    signUp?: {
      request: { schema: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    changePassword?: {
      request: { schema?: TAnyObjectSchema };
      response: { schema: TAnyObjectSchema };
    };
    refreshToken?: {
      response: { schema: TAnyObjectSchema };
    };
    getUserInformation?: {
      response: { schema: TAnyObjectSchema };
    };
  };
};

export type TAuthenticationRestOptions = {} & (
  | { useAuthController?: false | undefined }
  | {
      useAuthController: true;
      controllerOpts: TDefineAuthControllerOpts;
    }
);

export interface IJWSTokenServiceOptions {
  headerAlgorithm?: string;
  jwtSecret: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];
  /** Overrides the payload cipher - pass `LegacyAES` to keep reading tokens issued before the PBKDF2 envelope. */
  cipher?: IPayloadCipher;
}

export type TJWKSAlgorithm = 'ES256' | 'RS256' | 'EdDSA';

export interface IJWKSIssuerOptions {
  mode: typeof JWKSModes.ISSUER;
  algorithm: TJWKSAlgorithm;
  rest?: { path: string };
  keys: {
    driver: TJWKSKeyDriver;
    format: TJWKSKeyFormat;
    private: string; // Key content (text) or file path (file) — PEM or JWK based on format
    public: string; // Key content (text) or file path (file) — PEM or JWK based on format
  };
  kid: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];
  /** Overrides the payload cipher - pass `LegacyAES` to keep reading tokens issued before the PBKDF2 envelope. */
  cipher?: IPayloadCipher;
}

export interface IJWKSVerifierOptions {
  mode: typeof JWKSModes.VERIFIER;
  jwksUrl: string;
  cacheTtlMs?: number; // Default: 43_200_000 (12h)
  cooldownMs?: number; // Default: 30_000 (30s)
  aesAlgorithm?: AESAlgorithmType;
  applicationSecret?: string;
  fieldCodecs?: IPayloadFieldCodec[];
  /** Overrides the payload cipher - pass `LegacyAES` to keep reading tokens issued before the PBKDF2 envelope. */
  cipher?: IPayloadCipher;
}

export type TJWKSTokenServiceOptions = IJWKSIssuerOptions | IJWKSVerifierOptions;

export type TJWTTokenServiceOptions =
  | { standard: typeof JOSEStandards.JWS; options: IJWSTokenServiceOptions }
  | { standard: typeof JOSEStandards.JWKS; options: TJWKSTokenServiceOptions };

export type TBasicTokenServiceOptions<E extends Env = Env> = {
  /** Callback to verify basic auth credentials. Returns IAuthUser if valid, null otherwise. */
  verifyCredentials: (opts: {
    credentials: { username: string; password: string };
    context: TContext<E, string>;
  }) => Promise<IAuthUser | null>;
};
export interface IAuthenticateOptions {
  restOptions?: TAuthenticationRestOptions;
  jwtOptions?: TJWTTokenServiceOptions;
  basicOptions?: TBasicTokenServiceOptions;
}

export interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}

export interface IJWTTokenPayload extends JWTPayload, IAuthUser {
  userId: IdType;
  roles: { id: IdType; identifier: string; priority: number }[];

  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;

  [extra: string | symbol]: any;
}

export interface IPayloadFieldCodec<T = unknown> {
  key: string;
  serialize(opts: { value: T }): string;
  deserialize(opts: { raw: string }): T;
}

export type TGetTokenExpiresFn = () => ValueOrPromise<number>;

export interface IAuthenticationStrategy<E extends Env = Env> {
  name: string;
  authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}

export type TAuthenticateFn<RouteEnv extends Env = Env> = (opts: {
  strategies: string[];
  mode?: TAuthMode;
}) => MiddlewareHandler<RouteEnv>;

export interface IAuthService<
  E extends Env = Env,
  // SignIn types
  SIRQ extends TSignInRequest = TSignInRequest,
  SIRS = AnyObject,
  // SignUp types
  SURQ extends TSignUpRequest = TSignUpRequest,
  SURS = AnyObject,
  // ChangePassword types
  CPRQ extends TChangePasswordRequest = TChangePasswordRequest,
  CPRS = AnyObject,
  // UserInformation types
  UIRQ = AnyObject,
  UIRS = AnyObject,
  // RefreshToken types
  RTRS = AnyObject,
> {
  signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
  signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
  changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
  refreshToken?(context: TContext<E>): Promise<RTRS>;
}
