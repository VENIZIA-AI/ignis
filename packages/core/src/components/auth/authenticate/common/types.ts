import { IdType } from '@/base/models';
import { AESAlgorithmType, AnyObject, ValueOrPromise } from '@venizia/ignis-helpers';
import { Context, Env, Input } from 'hono';
import { JWTPayload } from 'jose';
import { TChangePasswordRequest, TSignInRequest, TSignUpRequest } from '../../models/requests';
import { z } from '@hono/zod-openapi';
import { Authentication } from './constants';

// Extend Hono's context variables to include authentication-related data
declare module 'hono' {
  interface ContextVariableMap<User extends IAuthUser = IAuthUser> {
    [Authentication.CURRENT_USER]: User;
    [Authentication.AUDIT_USER_ID]: IdType;
  }
}

export interface IJWTTokenServiceOptions {
  aesAlgorithm?: AESAlgorithmType;
  headerAlgorithm?: string;
  jwtSecret: string;
  applicationSecret: string;
  getTokenExpiresFn: TGetTokenExpiresFn;
}

export type TDefineAuthControllerOpts = {
  restPath?: string;
  serviceKey?: string;
  requireAuthenticatedSignUp?: boolean;
  payload?: {
    signIn?: {
      request: { schema: z.ZodObject };
      response: { schema: z.ZodObject };
    };
    signUp?: {
      request: { schema: z.ZodObject };
      response: { schema: z.ZodObject };
    };
    changePassword?: {
      request: { schema?: z.ZodObject };
      response: { schema: z.ZodObject };
    };
  };
};

export interface IAuthenticateOptions {
  restOptions?: {} & (
    | { useAuthController?: false | undefined }
    | {
        useAuthController: true;
        controllerOpts: TDefineAuthControllerOpts;
      }
  );
  alwaysAllowPaths: Array<string>;
  tokenOptions: IJWTTokenServiceOptions;
}

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
