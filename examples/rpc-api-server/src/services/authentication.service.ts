import {
  BaseService,
  IAuthService,
  TContext,
  TSignInRequest,
  TSignUpRequest,
  TChangePasswordRequest,
} from '@venizia/ignis';
import type { AnyObject } from '@venizia/ignis-helpers';
import type { Env } from 'hono';

export class AuthenticationService
  extends BaseService
  implements
    IAuthService<
      Env,
      TSignInRequest,
      AnyObject,
      TSignUpRequest,
      AnyObject,
      TChangePasswordRequest,
      AnyObject
    >
{
  constructor() {
    super({ scope: AuthenticationService.name });
  }

  signIn(context: TContext, opts: TSignInRequest): Promise<AnyObject> {
    this.logger.for('signIn').info(' Start sign in');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  signUp(context: TContext, opts: TSignUpRequest): Promise<AnyObject> {
    this.logger.for('signUp').info(' Start sign up');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  changePassword(context: TContext, opts: TChangePasswordRequest): Promise<AnyObject> {
    this.logger.for('changePassword').info(' Start change password');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  getUserInformation?(context: TContext, opts: AnyObject): Promise<AnyObject> {
    this.logger.for('get').info(' Start get user info');
    console.log(context, opts);
    return Promise.resolve(opts);
  }
}
