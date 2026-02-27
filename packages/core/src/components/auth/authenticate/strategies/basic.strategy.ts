import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BindingNamespaces } from '@/common/bindings';
import { BaseHelper } from '@venizia/ignis-helpers';
import { BindingKeys } from '@venizia/ignis-inversion';
import { Env } from 'hono';
import { Authentication, IAuthUser, IAuthenticationStrategy } from '../common';
import { BasicTokenService } from '../services';

/** HTTP Basic Authentication strategy using Authorization header credentials. */
export class BasicAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_BASIC;

  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: BasicTokenService.name,
      }),
    })
    private service: BasicTokenService<E>,
  ) {
    super({ scope: BasicAuthenticationStrategy.name });
  }

  async authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const credentials = this.service.extractCredentials(context);
    return this.service.verify({ credentials, context });
  }
}
