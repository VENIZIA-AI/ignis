export class HealthCheckBindingKeys {
  static readonly HEALTH_CHECK_OPTIONS = '@app/health-check/options';
  /** The component resolves `getAppInfo()` once (it is async) and binds the result for the controller. */
  static readonly APPLICATION_INFO = '@app/health-check/application-info';
}
