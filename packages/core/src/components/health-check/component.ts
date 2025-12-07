import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { controller, inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { Binding, ValueOrPromise } from '@vez/ignis-helpers';
import { HealthCheckBindingKeys, IHealthCheckOptions } from './common';
import { HealthCheckController } from './controller';

const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: '/health' },
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
    const healthOptions =
      this.application.get<IHealthCheckOptions>({
        key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
        isOptional: true,
      }) ?? DEFAULT_OPTIONS;

    Reflect.decorate([controller({ path: healthOptions.restOptions.path })], HealthCheckController);
    this.application.controller(HealthCheckController);
  }
}
