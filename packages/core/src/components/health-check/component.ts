import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { controller, inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { HealthCheckBindingKeys, IHealthCheckOptions } from './common';
import { HealthCheckController } from './controller';
import { Binding } from '@/helpers/inversion';

const DEFAULT_REST_PATH = '/health';
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: DEFAULT_REST_PATH },
};

export class HealthCheckComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: HealthCheckComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS]: Binding.bind<IHealthCheckOptions>({
          key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const healthOptions = this.application.get<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
      isOptional: true,
    });

    // A partially filled options binding (env/config driven) must not take the app down at boot.
    const path = healthOptions?.restOptions?.path ?? DEFAULT_REST_PATH;

    Reflect.decorate([controller({ path })], HealthCheckController);
    this.application.controller(HealthCheckController);
  }
}
