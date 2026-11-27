import type { RouteConfig as HonoRouteConfig } from '@hono/zod-openapi';

/** The one place an IGNIS route config becomes the type Hono registers. */
export class RouteConfigUtility {
  static toHono<RouteConfig extends object>(opts: {
    config: RouteConfig;
  }): RouteConfig & HonoRouteConfig {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- IAuthRouteConfig deliberately does not extend Hono's RouteConfig: comparing the two checks every zod type of every route
    return opts.config as RouteConfig & HonoRouteConfig;
  }
}
