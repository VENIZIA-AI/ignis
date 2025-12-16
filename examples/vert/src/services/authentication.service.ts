import {
  TChangePasswordRequestSchema,
  TChangePasswordResponseSchema,
  TGetUserInformationRequestSchema,
  TGetUserInformationResponseSchema,
  TSignInRequestSchema,
  TSignUpRequestSchema,
  TSignUpResponseSchema,
} from '@/schemas';
import { BaseService, IAuthService } from '@venizia/ignis';
import { Context } from 'hono';

export class AuthenticationService
  extends BaseService
  implements
    IAuthService<
      TSignInRequestSchema,
      TSignInRequestSchema,
      TSignUpRequestSchema,
      TSignUpResponseSchema,
      TChangePasswordRequestSchema,
      TChangePasswordResponseSchema,
      TGetUserInformationRequestSchema,
      TGetUserInformationResponseSchema
    >
{
  constructor() {
    super({ scope: AuthenticationService.name });
  }
  signIn(context: Context, opts: TSignInRequestSchema): Promise<TSignInRequestSchema> {
    this.logger.info('SignIn called with opts: %o', opts);
    console.log(context, opts);
    return Promise.resolve(opts);
  }
  signUp(context: Context, opts: TSignUpRequestSchema): Promise<TSignUpResponseSchema> {
    this.logger.info('SignUp called with opts: %o', opts);
    console.log(context, opts);
    return Promise.resolve({ message: 'User registered successfully' });
  }
  changePassword(
    context: Context,
    opts: TChangePasswordRequestSchema,
  ): Promise<TChangePasswordResponseSchema> {
    this.logger.info('ChangePassword called with opts: %o', opts);
    console.log(context, opts);
    return Promise.resolve({ message: 'Password changed successfully' });
  }
  getUserInformation?(
    context: Context,
    opts: TGetUserInformationRequestSchema,
  ): Promise<TGetUserInformationResponseSchema> {
    this.logger.info('GetUserInformation called with opts: %o', opts);
    console.log(context, opts);
    return Promise.resolve({});
  }
}
