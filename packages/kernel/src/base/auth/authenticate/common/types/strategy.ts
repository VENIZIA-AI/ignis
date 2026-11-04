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

/** The authenticated identity a strategy returns and the request context stores. Carries at least `userId`. */
export interface IAuthUser {
  userId: IdType;
  [extra: string | symbol]: any;
}

/** A strategy that authenticates a request. `name` is the name it is registered under; `authenticate` returns the user or throws. */
export interface IAuthenticationStrategy<E extends Env = Env> {
  name: string;
  authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}

/** Builds the authentication middleware for the listed strategy names. `mode` defaults to `any`. */
export type TAuthenticateFn<RouteEnv extends Env = Env> = (opts: {
  strategies: string[];
  mode?: TAuthMode;
}) => MiddlewareHandler<RouteEnv>;

/** The service behind the auth controller routes. `getUserInformation` and `refreshToken` are optional. The type parameters set each route's request and response types. */
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
