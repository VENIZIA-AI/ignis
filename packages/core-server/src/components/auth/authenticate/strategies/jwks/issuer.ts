import { TContext } from '@venizia/ignis-kernel';
import { inject } from '@venizia/ignis-kernel';
import { BindingNamespaces } from '@venizia/ignis-kernel';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { BindingKeys } from '@venizia/ignis-inversion';
import { Env } from 'hono';
import {
  Authentication,
  IAuthUser,
  IAuthenticationStrategy,
  JOSEStandards,
} from '@venizia/ignis-kernel';
import { JWKSIssuerTokenService } from '../../services';

export class JWKSIssuerAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT;
  standard = JOSEStandards.JWKS;

  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JWKSIssuerTokenService.name,
      }),
    })
    private service: JWKSIssuerTokenService<E>,
  ) {
    super({ scope: JWKSIssuerAuthenticationStrategy.name });
  }

  authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
