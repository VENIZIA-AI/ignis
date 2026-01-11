import {
  AnyObject,
  BaseService,
  IAuthService,
  TSignInRequest,
  TSignUpRequest,
  TChangePasswordRequest,
} from '@venizia/ignis';
import { Context } from 'hono';

export class AuthenticationService
  extends BaseService
  implements
    IAuthService<TSignInRequest, any, TSignUpRequest, any, TChangePasswordRequest, any>
{
  constructor() {
    super({ scope: AuthenticationService.name });
  }

  signIn(context: Context, opts: TSignInRequest): Promise<AnyObject> {
    this.logger.for('signIn').info(' Start sign in');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  signUp(context: Context, opts: TSignUpRequest): Promise<AnyObject> {
    this.logger.for('signUp').info(' Start sign up');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  changePassword(context: Context, opts: TChangePasswordRequest): Promise<AnyObject> {
    this.logger.for('changePassword').info(' Start change password');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  getUserInformation?(context: Context, opts: AnyObject): Promise<AnyObject> {
    this.logger.for('get').info(' Start get user info');
    console.log(context, opts);
    return Promise.resolve(opts);
  }
}