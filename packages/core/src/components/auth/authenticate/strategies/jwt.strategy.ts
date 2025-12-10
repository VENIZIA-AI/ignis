import { inject } from '@/base/metadata';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Context, Env, Input } from 'hono';
import { IAuthUser, IAuthenticationStrategy } from '../common';
import { Authentication } from '../common/constants';
import { JWTTokenService } from '../services';

export class JWTAuthenticationStrategy<
  E extends Env = any,
  P extends string = any,
  I extends Input = {},
>
  extends BaseHelper
  implements IAuthenticationStrategy<E, P, I>
{
  name = Authentication.STRATEGY_JWT;

  constructor(@inject({ key: 'services.JWTTokenService' }) private service: JWTTokenService) {
    super({ scope: JWTAuthenticationStrategy.name });
  }

  authenticate(context: Context): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
