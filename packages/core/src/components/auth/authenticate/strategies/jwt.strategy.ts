import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BindingNamespaces } from '@/common/bindings';
import { BaseHelper } from '@venizia/ignis-helpers';
import { BindingKeys } from '@venizia/ignis-inversion';
import { Env } from 'hono';
import { Authentication, IAuthUser, IAuthenticationStrategy } from '../common';
import { JWTTokenService } from '../services';

export class JWTAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT;

  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JWTTokenService.name,
      }),
    })
    private service: JWTTokenService<E>,
  ) {
    super({ scope: JWTAuthenticationStrategy.name });
  }

  authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
