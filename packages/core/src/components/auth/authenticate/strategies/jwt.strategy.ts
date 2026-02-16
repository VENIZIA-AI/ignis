import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { Authentication, IAuthUser, IAuthenticationStrategy } from '../common';
import { JWTTokenService } from '../services';

export class JWTAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT;

  constructor(@inject({ key: 'services.JWTTokenService' }) private service: JWTTokenService<E>) {
    super({ scope: JWTAuthenticationStrategy.name });
  }

  authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
