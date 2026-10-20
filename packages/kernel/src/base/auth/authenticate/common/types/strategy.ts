import type { TContext } from '@/base/controllers/common/types';
import type { IdType } from '@/base/models/common';
import type { AnyObject } from '@venizia/ignis-helpers/common';
import type { Env, MiddlewareHandler } from 'hono';
import type {
  TChangePasswordRequest,
  TSignInRequest,
  TSignUpRequest,
} from '../../../models/requests';
import type { TAuthMode } from '../constants';

export interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}

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
