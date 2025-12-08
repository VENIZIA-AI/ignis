import { RouteConfig } from '@hono/zod-openapi';
import { TAuthRouteConfig } from '../common';

export const defineRouteConfigs = <RC extends TAuthRouteConfig<RouteConfig>>(configs: RC) => {
  return configs;
};
