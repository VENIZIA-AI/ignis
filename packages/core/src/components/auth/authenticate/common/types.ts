import { IdType } from '@/base/models';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import { AESAlgorithmType, AnyObject, ValueOrPromise } from '@venizia/ignis-helpers';
import { Context, Env, Input } from 'hono';
import { JWTPayload } from 'jose';
import { TChangePasswordRequest, TSignInRequest, TSignUpRequest } from '../../models/requests';
import { Authentication } from './constants';

// Extend Hono's context variables to include authentication-related data
declare module 'hono' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface ContextVariableMap<User extends IAuthUser = IAuthUser> {
    [Authentication.CURRENT_USER]: User;
    [Authentication.AUDIT_USER_ID]: IdType;
  }
}

// --------------------------------------------------------------------------------------------------------
export type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey?: string;
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
  };
};

export type TAuthenticationRestOptions = {} & (
  | { useAuthController?: false | undefined }
  | {
      useAuthController: true;
      controllerOpts: TDefineAuthControllerOpts;
    }
);

export interface IJWTTokenServiceOptions {
  aesAlgorithm?: AESAlgorithmType;
  headerAlgorithm?: string;
  jwtSecret: string;
  applicationSecret: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
}

export interface IBasicTokenServiceOptions {
  /**
   * Callback function to verify basic authentication credentials.
   * Implement this to look up user and verify password.
   *
   * @param credentials - The extracted username and password
   * @param context - The Hono request context (for accessing repos, services, etc.)
   * @returns IAuthUser if valid, null if invalid
   *
   * @example
   * ```typescript
   * const verifyCredentials: TBasicAuthVerifyFn = async (creds, ctx) => {
   *   const user = await userRepo.findByUsername(creds.username);
   *   if (user && await bcrypt.compare(creds.password, user.passwordHash)) {
   *     return { userId: user.id, roles: user.roles };
   *   }
   *   return null;
   * };
   * ```
   */
  verifyCredentials: (opts: {
    credentials: { username: string; password: string };
    context: Context;
  }) => Promise<IAuthUser | null>;
}

// --------------------------------------------------------------------------------------------------------
// Authenticate Options
// --------------------------------------------------------------------------------------------------------

export interface IAuthenticateOptions {
  restOptions?: TAuthenticationRestOptions;
  jwtOptions?: IJWTTokenServiceOptions;
  basicOptions?: IBasicTokenServiceOptions;
}

// --------------------------------------------------------------------------------------------------------
export interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}

export interface IJWTTokenPayload extends JWTPayload, IAuthUser {
  userId: IdType;
  roles: { id: IdType; identifier: string; priority: number }[];

  // Optional extra fields
  clientId?: string;
  provider?: string;
  email?: string;
  name?: string;

  // Unknow extra fields
  [extra: string | symbol]: any;
}

export type TGetTokenExpiresFn = () => ValueOrPromise<number>;

export interface IAuthenticationStrategy<
  E extends Env = any,
  P extends string = any,
  I extends Input = {},
> {
  name: string;
  authenticate(context: Context<E, P, I>): Promise<IAuthUser>;
}

// --------------------------------------------------------------------------------------------------------
export interface IAuthService<
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
> {
  signIn(context: Context, opts: SIRQ): Promise<SIRS>;
  signUp(context: Context, opts: SURQ): Promise<SURS>;
  changePassword(context: Context, opts: CPRQ): Promise<CPRS>;
  getUserInformation?(context: Context, opts: UIRQ): Promise<UIRS>;
}
