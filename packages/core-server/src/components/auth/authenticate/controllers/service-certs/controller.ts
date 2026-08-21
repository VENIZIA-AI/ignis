import {
  AuthenticateBindingKeys,
  BaseRestController,
  BindingNamespaces,
  inject,
} from '@venizia/ignis-kernel';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BindingKeys } from '@venizia/ignis-inversion';
import { ServiceAssertionSignerService } from '../../services/service/signer.service';
import { ServiceCertsRouteConfigs } from './definitions';

/** Publishes this service's assertion-signing public key. Mounted only when signing keys are configured. */
export class ServiceCertsController extends BaseRestController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: ServiceAssertionSignerService.name,
      }),
    })
    private readonly signer: ServiceAssertionSignerService,
    @inject({ key: AuthenticateBindingKeys.SERVICE_CERTS_PATH })
    path: string,
  ) {
    super({ scope: ServiceCertsController.name, path, isStrict: true });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: ServiceCertsRouteConfigs.GET_SERVICE_CERTS,
      handler: async context => {
        const jwks = await this.signer.getPublicJWKS();
        context.header('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');
        return context.json(jwks, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
