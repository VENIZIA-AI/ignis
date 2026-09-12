import type { IBuildInfo } from '@venizia/ignis-helpers/core';

export interface IHealthCheckOptions {
  /** Partially-filled bindings are accepted; every missing field falls back to its default. */
  restOptions?: { path?: string };
  /**
   * `GET <path>/stats`: build stamp, process and memory. The runtime and version it reports are
   * exactly what an attacker needs to pick an exploit, so the default is CLOSED on every host that
   * is not provably a development one.
   */
  stats?: {
    /**
     * Default: open only when `NODE_ENV` names a development environment
     * (`Environment.DEVELOPMENT_ENVS`). `staging`, `uat`, `production`, an unrecognised name and an
     * unset `NODE_ENV` all keep the route closed.
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
