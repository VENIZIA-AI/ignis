import type { IBuildInfo } from '@venizia/ignis-helpers/core';

/**
 * Options of `HealthCheckComponent`, bound at `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS`.
 *
 * @example
 * ```typescript
 * import { HealthCheckBindingKeys, type BaseApplication, type IHealthCheckOptions } from '@venizia/ignis';
 *
 * export const bindHealth = (application: BaseApplication) => {
 *   application
 *     .bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
 *     .toValue({ restOptions: { path: '/status' }, stats: { secretKey: 'change-me' } });
 * };
 * ```
 */
export interface IHealthCheckOptions {
  /** Partially-filled bindings are accepted; every missing field falls back to its default. */
  restOptions?: {
    /**
     * Base path the health routes mount under.
     *
     * @default '/health'
     */
    path?: string;
  };
  /**
   * `GET <path>/stats`: build stamp, process and memory. The runtime and version it reports are
   * exactly what an attacker needs to pick an exploit, so the default is CLOSED on every host that
   * is not provably a development one.
   */
  stats?: {
    /**
     * Whether the route is mounted. Left out, it is open only when `NODE_ENV` names a development
     * environment (`Environment.DEVELOPMENT_ENVS`); `staging`, `uat`, `production`, an unrecognised
     * name and an unset `NODE_ENV` all keep it closed.
     *
     * @default true in a development environment, false otherwise
     */
    enable?: boolean;
    /**
     * When set, the route answers only for a request carrying this value in `X-Health-Key`, and a
     * refusal is indistinguishable from an unmounted route. A blank value fails closed.
     * Without the field the route is open to anything that can reach the port.
     */
    secretKey?: string;
    /** Wins over {@link BuildInfoRegistry}; a host that stamps its own build passes it here. */
    buildInfo?: IBuildInfo;
  };
}
