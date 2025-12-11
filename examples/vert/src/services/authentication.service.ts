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
  implements IAuthService<TSignInRequest, any, TSignUpRequest, any, TChangePasswordRequest, any>
{
  constructor() {
    super({ scope: AuthenticationService.name });
  }

  signIn(context: Context, opts: TSignInRequest): Promise<AnyObject> {
    this.logger.info('[signIn] Start sign in');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  signUp(context: Context, opts: TSignUpRequest): Promise<AnyObject> {
    this.logger.info('[signUp] Start sign up');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  changePassword(context: Context, opts: TChangePasswordRequest): Promise<AnyObject> {
    this.logger.info('[changePassword] Start change password');
    console.log(context, opts);
    return Promise.resolve(opts);
  }

  getUserInformation?(context: Context, opts: AnyObject): Promise<AnyObject> {
    this.logger.info('[get] Start get user info');
    console.log(context, opts);
    return Promise.resolve(opts);
  }
}
