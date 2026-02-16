import { BaseApplication } from '@/base/applications/base';
import { BaseComponent } from '@/base/components/base';
import { inject } from '@/base/metadata/injectors';
import { CoreBindings } from '@/common/bindings';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { AuthorizeBindingKeys, IAuthorizeOptions } from './common';
import { AuthorizationEnforcerRegistry } from './enforcers';

export class AuthorizeComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: AuthorizeComponent.name,
      initDefault: { enable: true, container: application },
    });
  }

  // ---------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    const authorizeOptions = this.application.get<IAuthorizeOptions>({
      key: AuthorizeBindingKeys.OPTIONS,
      isOptional: true,
    });

    if (!authorizeOptions) {
      this.logger
        .for(this.binding.name)
        .debug('No authorize options found, skipping authorization setup');
      return;
    }

    if (!authorizeOptions.enforcer) {
      throw getError({
        message: '[AuthorizeComponent] enforcer class is required in authorize options',
      });
    }

    // Register the enforcer with the registry
    const enforcerInstance = new authorizeOptions.enforcer(authorizeOptions);
    const enforcerName = enforcerInstance.name;

    AuthorizationEnforcerRegistry.getInstance().register({
      container: this.application,
      enforcers: [{ enforcer: authorizeOptions.enforcer, name: enforcerName }],
    });

    // Bind alwaysAllowRoles if provided
    if (authorizeOptions.alwaysAllowRoles?.length) {
      this.application
        .bind<string[]>({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES })
        .toValue(authorizeOptions.alwaysAllowRoles);
    }

    // Bind normalizePayloadFn if provided
    if (authorizeOptions.normalizePayloadFn) {
      this.application
        .bind<typeof authorizeOptions.normalizePayloadFn>({
          key: AuthorizeBindingKeys.NORMALIZE_PAYLOAD_FN,
        })
        .toValue(authorizeOptions.normalizePayloadFn);
    }

    this.logger
      .for(this.binding.name)
      .info('Authorization configured with enforcer: %s', enforcerName);
  }
}
