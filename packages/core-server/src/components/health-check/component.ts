import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { controller, inject } from '@/base/metadata';
import { CoreBindings } from '@venizia/ignis-kernel';
import { HealthCheckBindingKeys, type IHealthCheckOptions } from './common';
import { HealthCheckController } from './controller';
import { Binding } from '@venizia/ignis-kernel';
import type { IApplicationInfo } from '@venizia/ignis-kernel';

const DEFAULT_REST_PATH = '/health';
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: DEFAULT_REST_PATH },
};

export class HealthCheckComponent extends BaseComponent<IHealthCheckOptions> {
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

  /**
   * `application.component(HealthCheckComponent, { options })` lands here. Options given at the
   * call site are the most explicit statement of intent, so they take the binding over anything
   * bound earlier; `initDefaultBindings` then finds the key taken and leaves the default aside.
   */
  override async configure(opts?: IHealthCheckOptions): Promise<void> {
    // The base short-circuits a second call; binding before that check would swap the options
    // under routes that were already mounted from the first ones.
    if (this.isConfigured) {
      return;
    }

    if (opts !== undefined) {
      this.application
        .bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
        .toValue(opts);
    }

    await super.configure(opts);
  }

  override async binding(): Promise<void> {
    const healthOptions = this.application.get<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
      isOptional: true,
    });

    // A partially filled options binding (env/config driven) must not take the app down at boot.
    const path = healthOptions?.restOptions?.path ?? DEFAULT_REST_PATH;

    // `getAppInfo()` is async while the container builds the controller synchronously, so the
    // resolved value is bound here rather than resolved inside the controller.
    this.application
      .bind<IApplicationInfo>({ key: HealthCheckBindingKeys.APPLICATION_INFO })
      .toValue(await this.application.getAppInfo());

    // The gate and the app identity are per container, but `@controller` writes the PATH onto this
    // one shared class in the process-wide MetadataRegistry, and `RestComponent` reads it back at
    // step 8. Two applications booted one after another are safe; two booted CONCURRENTLY with
    // different `restOptions.path` would race here, and nothing in this component prevents that.
    Reflect.decorate([controller({ path })], HealthCheckController);
    this.application.controller(HealthCheckController);
  }
}
