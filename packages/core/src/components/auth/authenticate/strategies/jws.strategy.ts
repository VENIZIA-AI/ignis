import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BindingNamespaces } from '@/common/bindings';
import { BaseHelper } from '@venizia/ignis-helpers';
import { BindingKeys } from '@venizia/ignis-inversion';
import { Env } from 'hono';
import { Authentication, IAuthUser, IAuthenticationStrategy, JOSEStandards } from '../common';
import { JWSTokenService } from '../services';

export class JWSAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT;
  standard = JOSEStandards.JWS;

  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JWSTokenService.name,
      }),
    })
    private service: JWSTokenService<E>,
  ) {
    super({ scope: JWSAuthenticationStrategy.name });
  }

  authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
