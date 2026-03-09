import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BindingNamespaces } from '@/common/bindings';
import { BaseHelper } from '@venizia/ignis-helpers';
import { BindingKeys } from '@venizia/ignis-inversion';
import { Env } from 'hono';
import { Authentication, IAuthUser, IAuthenticationStrategy, JOSEStandards } from '../common';
import { JWKSIssuerTokenService } from '../services';
import { JWKSVerifierTokenService } from '../services';

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

export class JWKSVerifierAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_JWT;
  standard = JOSEStandards.JWKS;

  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JWKSVerifierTokenService.name,
      }),
    })
    private service: JWKSVerifierTokenService<E>,
  ) {
    super({ scope: JWKSVerifierAuthenticationStrategy.name });
  }

  authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = this.service.extractCredentials(context);
    return this.service.verify(token);
  }
}
