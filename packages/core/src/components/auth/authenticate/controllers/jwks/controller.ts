import { BaseController } from '@/base/controllers/base';
import { inject } from '@/base/metadata/injectors';
import { BindingNamespaces } from '@/common/bindings';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers';
import { BindingKeys } from '@venizia/ignis-inversion';
import { JWKSIssuerTokenService } from '../../services';
import { RouteConfigs } from './definitions';

export class JWKSController extends BaseController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JWKSIssuerTokenService.name,
      }),
    })
    private jwksService: JWKSIssuerTokenService,
  ) {
    super({
      scope: JWKSController.name,
      path: '/certs',
      isStrict: true,
    });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: RouteConfigs.GET_JWKS_CERTS,
      handler: async context => {
        const jwks = await this.jwksService.getJWKSAsync();
        context.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        return context.json(jwks, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
