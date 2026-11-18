import { BindingKeys } from '@venizia/ignis-inversion';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import type { IHealthCheckOptions } from './types';

/** Container keys of the health check component. */
export class HealthCheckBindingKeys {
  static readonly HEALTH_CHECK_OPTIONS = BindingKeys.build<IHealthCheckOptions>({
    key: '@app/health-check/options',
  });

  /** The component resolves `getAppInfo()` once (it is async) and binds the result for the controller. */
  static readonly APPLICATION_INFO = BindingKeys.build<IApplicationInfo>({
    key: '@app/health-check/application-info',
  });
}
