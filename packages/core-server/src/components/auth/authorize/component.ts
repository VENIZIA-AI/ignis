import type { BaseApplication } from '@/base/applications/base';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@venizia/ignis-kernel';
import { CoreBindings } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  AuthorizationEnforcerRegistry,
  AuthorizeBindingKeys,
  IAuthorizeOptions,
} from '@venizia/ignis-kernel';

export class AuthorizeComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: AuthorizeComponent.name,
      initDefault: { enable: true, container: application },
    });
  }

  override binding(): ValueOrPromise<void> {
    const options = this.application.get<IAuthorizeOptions>({
      key: AuthorizeBindingKeys.OPTIONS,
      isOptional: true,
    });

    if (!options) {
      throw getError({
        message:
          '[AuthorizeComponent] No authorize options found. Bind options to AuthorizeBindingKeys.OPTIONS before registering the component.',
      });
    }

    this.bindAlwaysAllowRoles({ options });

    // The registry otherwise finds options only through a registered enforcer's container, so
    // `defaultDecision` would be unreadable in the one case it decides: no enforcer registered.
    AuthorizationEnforcerRegistry.getInstance().setOptions({ options });

    this.logger.for(this.binding.name).info('Authorization configured');
  }

  private bindAlwaysAllowRoles(opts: { options: IAuthorizeOptions }): void {
    if (!opts.options.alwaysAllowRoles?.length) {
      return;
    }

    this.application
      .bind<string[]>({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES })
      .toValue(opts.options.alwaysAllowRoles);
  }
}
