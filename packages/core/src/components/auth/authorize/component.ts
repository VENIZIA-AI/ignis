import type { BaseApplication } from '@/base/applications/base';
import { BaseComponent } from '@/base/components/base';
import { inject } from '@/base/metadata/injectors';
import { CoreBindings } from '@/common/bindings';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { AuthorizeBindingKeys, IAuthorizeOptions } from './common';

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
