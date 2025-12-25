import { getIdType, idParamsSchema, jsonContent, jsonResponse } from '@/base/models';
import { CountSchema, FilterSchema, WhereSchema } from '@/base/repositories';
import { RouteConfig, z } from '@hono/zod-openapi';
import { HTTP, TAuthStrategy } from '@venizia/ignis-helpers';
import { RestPaths, TAuthRouteConfig } from '../common';

export const defineRouteConfigs = <RC extends TAuthRouteConfig<RouteConfig>>(configs: RC) => {
  return configs;
};

/**
 * Per-route authentication configuration
 *
 * Priority (endpoint config takes precedence over controller):
 * 1. If endpoint has `skipAuth: true` → no auth (ignores controller authStrategies)
 * 2. If endpoint has `authStrategies` → use these (overrides controller authStrategies)
 * 3. Otherwise → use controller-level authStrategies
 *
 * @example
 * // Skip auth for this endpoint (even if controller has authStrategies)
 * { skipAuth: true }
 *
 * @example
 * // Use specific auth for this endpoint (overrides controller)
 * { authStrategies: ['jwt'] }
 */
type TRouteAuthConfig =
  | { skipAuth: true }
  | { skipAuth?: false; authStrategies: Array<TAuthStrategy> };

export type TReadRouteConfig = TRouteAuthConfig & { schema?: z.ZodObject };
export type TWriteRouteConfig = TReadRouteConfig & { requestBody?: z.ZodObject };
export type TDeleteRouteConfig = TRouteAuthConfig & { schema?: z.ZodObject };

/**
 * Compact per-route configuration combining schema and auth
 */
export type TRoutesConfig = {
  // READ routes
  count?: TReadRouteConfig;
  find?: TReadRouteConfig;
  findOne?: TReadRouteConfig;
  findById?: TReadRouteConfig;

  // WRITE routes
  create?: TWriteRouteConfig;
  updateById?: TWriteRouteConfig;
  updateBy?: TWriteRouteConfig;

  // DELETE routes
  deleteById?: TDeleteRouteConfig;
  deleteBy?: TDeleteRouteConfig;
};

export const defineControllerRouteConfigs = (opts: {
  isStrict: boolean;
  idType: ReturnType<typeof getIdType>;
  authStrategies?: Array<TAuthStrategy>;
  schema: { select: z.ZodObject; create: z.ZodObject; update: z.ZodObject };
  routes?: TRoutesConfig;
}) => {
  const {
    isStrict,
    idType,
    authStrategies = [],
    schema: { select: selectSchema, create: createSchema, update: updateSchema },
    routes = {},
  } = opts;

  /**
   * Resolves auth strategies for a specific route
   *
   * Priority (endpoint first, then controller fallback):
   * 1. Endpoint skipAuth=true → no auth (ignores controller)
   * 2. Endpoint authStrategies → override controller (empty = no auth)
   * 3. Controller authStrategies → default fallback
   */
  const resolveRouteAuth = (routeKey: keyof TRoutesConfig): Array<TAuthStrategy> => {
    const endpointConfig = routes[routeKey];

    // Endpoint skip → no auth
    if (endpointConfig?.skipAuth) {
      return [];
    }

    // Endpoint authStrategies → override controller (empty = no auth)
    if (endpointConfig?.authStrategies) {
      return endpointConfig.authStrategies;
    }

    // Fallback to controller authStrategies
    return authStrategies;
  };

  const rs = {
    // -----------------------------------------------------------------------------
    // Count
    // -----------------------------------------------------------------------------
    COUNT: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.COUNT,
      authStrategies: resolveRouteAuth('count'),
      request: { query: z.object({ where: isStrict ? WhereSchema : z.optional(WhereSchema) }) },
      responses: jsonResponse({ schema: routes.count?.schema ?? CountSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Find
    // -----------------------------------------------------------------------------
    FIND: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.ROOT,
      authStrategies: resolveRouteAuth('find'),
      request: { query: z.object({ filter: FilterSchema }) },
      responses: jsonResponse({ schema: routes.find?.schema ?? selectSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Find by ID
    // -----------------------------------------------------------------------------
    FIND_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: '/:id',
      authStrategies: resolveRouteAuth('findById'),
      request: {
        params: idParamsSchema({ idType }),
        query: z.object({ filter: FilterSchema }),
      },
      responses: jsonResponse({ schema: routes.findById?.schema ?? selectSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Find One
    // -----------------------------------------------------------------------------
    FIND_ONE: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.FIND_ONE,
      authStrategies: resolveRouteAuth('findOne'),
      request: { query: z.object({ filter: FilterSchema }) },
      responses: jsonResponse({ schema: routes.findOne?.schema ?? selectSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Create
    // -----------------------------------------------------------------------------
    CREATE: defineRouteConfigs({
      method: HTTP.Methods.POST,
      path: RestPaths.ROOT,
      authStrategies: resolveRouteAuth('create'),
      request: {
        body: jsonContent({
          description: 'CREATE | Request body',
          schema: routes.create?.requestBody ?? createSchema,
        }),
      },
      responses: jsonResponse({
        schema: routes.create?.schema ?? z.object({ count: CountSchema, data: selectSchema }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Update by ID
    // -----------------------------------------------------------------------------
    UPDATE_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.PATCH,
      path: '/:id',
      authStrategies: resolveRouteAuth('updateById'),
      request: {
        params: idParamsSchema({ idType }),
        body: jsonContent({
          description: 'UPDATE BY ID | Request body',
          schema: routes.updateById?.requestBody ?? updateSchema,
        }),
      },
      responses: jsonResponse({
        schema: routes.updateById?.schema ?? z.object({ count: CountSchema, data: selectSchema }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Update by
    // -----------------------------------------------------------------------------
    UPDATE_BY: defineRouteConfigs({
      method: HTTP.Methods.PATCH,
      path: RestPaths.ROOT,
      authStrategies: resolveRouteAuth('updateBy'),
      request: {
        query: z.object({ where: WhereSchema }),
        body: jsonContent({
          description: 'UPDATE BY CONDITION | Request body',
          schema: routes.updateBy?.requestBody ?? updateSchema,
        }),
      },
      responses: jsonResponse({
        schema:
          routes.updateBy?.schema ?? z.object({ count: CountSchema, data: z.array(selectSchema) }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Delete by ID
    // -----------------------------------------------------------------------------
    DELETE_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.DELETE,
      path: '/:id',
      authStrategies: resolveRouteAuth('deleteById'),
      request: { params: idParamsSchema({ idType }) },
      responses: jsonResponse({
        schema: routes.deleteById?.schema ?? z.object({ count: CountSchema, data: selectSchema }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Delete by
    // -----------------------------------------------------------------------------
    DELETE_BY: defineRouteConfigs({
      method: HTTP.Methods.DELETE,
      path: RestPaths.ROOT,
      authStrategies: resolveRouteAuth('deleteBy'),
      request: { query: z.object({ where: WhereSchema }) },
      responses: jsonResponse({
        schema:
          routes.deleteBy?.schema ?? z.object({ count: CountSchema, data: z.array(selectSchema) }),
      }),
    }),
  } as const;

  return rs;
};
