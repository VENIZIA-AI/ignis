import { TContext } from '@/base/controllers';
import { inject } from '@/base/metadata';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { IAuthUser, IAuthenticationStrategy } from '../common';
import { Authentication } from '../common/constants';
import { JWTTokenService } from '../services';

export class JWTAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT;

  constructor(@inject({ key: 'services.JWTTokenService' }) private service: JWTTokenService<E>) {
    super({ scope: JWTAuthenticationStrategy.name });
  }

  authenticate(context: TContext<string, E>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
