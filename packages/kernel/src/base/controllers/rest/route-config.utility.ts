import type { RouteConfig as HonoRouteConfig } from '@hono/zod-openapi';
import type { IAuthRouteConfig } from '../common/types';

/** The one place an IGNIS route config becomes the type Hono registers. */
export class RouteConfigUtility {
  /**
   * Takes the config without `authenticate` and `authorize`: Hono would publish them in the OpenAPI document. The
   * `Omit` does not enforce that, since a config still holding them is assignable to it; the caller removes them.
   */
  static toHono<RouteConfig extends IAuthRouteConfig>(opts: {
    config: Omit<RouteConfig, 'authenticate' | 'authorize'>;
  }): RouteConfig & HonoRouteConfig {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- IAuthRouteConfig deliberately does not extend Hono's RouteConfig: comparing the two checks every zod type of every route
    return opts.config as RouteConfig & HonoRouteConfig;
  }
}
