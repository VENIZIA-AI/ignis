import { getIdType, idParamsSchema, jsonContent, jsonResponse } from '@/base/models';
import { CountSchema, FilterSchema, WhereSchema } from '@/base/repositories';
import { RouteConfig, z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers';
import { TAuthStrategy } from '@/components/auth/authenticate/common';
import { RestPaths, TAuthRouteConfig, TResponseHeaders, TRoutesConfig } from '../common';
import { TAnyObjectSchema } from '@/utilities/schema.utility';

/**
 * Type-safe wrapper for defining route configurations.
 */
export const defineRouteConfigs = <RC extends TAuthRouteConfig<RouteConfig>>(configs: RC) => {
  return configs;
};

// -----------------------------------------------------------------------------
// Default Headers
// -----------------------------------------------------------------------------

// Default request headers
export const trackableHeaders = z.object({
  [HTTP.Headers.REQUEST_TRACING_ID]: z.string().optional().openapi({
    description: 'Optional request ID',
  }),
  [HTTP.Headers.REQUEST_CHANNEL]: z
    .string()
    .optional()
    .openapi({
      description: 'Optional request channel',
      examples: ['channel-1', 'web', 'spos'],
    }),
  [HTTP.Headers.REQUEST_DEVICE_INFO]: z
    .string()
    .optional()
    .openapi({
      description: 'Optional request device info',
      examples: ['dev-1', 'device-abc', 'd-unique-id'],
    }),
});

export const countableHeaders = z.object({
  [HTTP.Headers.REQUEST_COUNT_DATA]: z
    .string()
    .optional()
    .openapi({
      description:
        'Controls response format. When "true" (default): returns {count, data}. When "false": returns data only.',
      examples: ['true', '1', 'false', '0'],
    }),
});

export const defaultRequestHeaders = trackableHeaders.extend(countableHeaders.shape);

// Default response headers (OpenAPI Header Object format)
export const commonResponseHeaders: TResponseHeaders = {
  [HTTP.Headers.REQUEST_TRACING_ID]: {
    description: 'Echo of the request tracing ID',
    schema: { type: 'string' },
  },
  [HTTP.Headers.RESPONSE_COUNT_DATA]: {
    description: 'Number of records in response',
    schema: { type: 'string', examples: ['1', '10', '100'] },
  },
  [HTTP.Headers.RESPONSE_FORMAT]: {
    description: 'Response format indicator',
    schema: { type: 'string', examples: ['array', 'object'] },
  },
};

export const findResponseHeaders: TResponseHeaders = {
  ...commonResponseHeaders,
  [HTTP.Headers.CONTENT_RANGE]: {
    description: 'Content range for pagination (e.g., "records 0-24/100")',
    schema: { type: 'string', examples: ['records 0-24/100', 'records 25-49/100'] },
  },
};

/**
 * Creates conditional count response schema.
 */
export const conditionalCountResponse = <T extends z.ZodTypeAny>(dataSchema: T) => {
  return z.union([
    CountSchema.extend({ data: dataSchema }).openapi({
      description: 'Response with count (when x-request-count header is "true" or omitted)',
    }),
    dataSchema.openapi({
      description: 'Data only response (when x-request-count header is "false")',
    }),
  ]);
};

// -----------------------------------------------------------------------------
// Route Config Resolvers
// -----------------------------------------------------------------------------

export const resolveCountConfig = (opts: { config: TRoutesConfig['count']; isStrict: boolean }) => {
  const { config, isStrict } = opts;
  const defaultQuery = z
    .object({
      where: isStrict
        ? WhereSchema
        : z.optional(WhereSchema).openapi({ description: 'Filter conditions' }),
    })
    .openapi({ description: 'Count query params' });
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? trackableHeaders,
    },
    response: {
      description: 'Total count of matching records',
      schema: config?.response?.schema ?? CountSchema,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

export const resolveFindConfig = <FindSchema extends TAnyObjectSchema>(opts: {
  config: TRoutesConfig['find'];
  selectSchema: FindSchema;
}) => {
  const { config, selectSchema } = opts;
  const defaultQuery = z.object({ filter: FilterSchema }).openapi({
    description: 'Filter with where, fields, limit, skip, order, include',
  });
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Array of matching records (with optional count)',
      schema: config?.response?.schema ?? conditionalCountResponse(z.array(selectSchema)),
      headers: config?.response?.headers ?? findResponseHeaders,
    },
  };
};

export const resolveFindByIdConfig = <FindByIdSchema extends TAnyObjectSchema>(opts: {
  idType: ReturnType<typeof getIdType>;
  config: TRoutesConfig['findById'];
  selectSchema: FindByIdSchema;
}) => {
  const { config, selectSchema, idType } = opts;
  const defaultQuery = z.object({ filter: FilterSchema }).openapi({
    description: 'Filter with fields, order, include (where ignored)',
  });
  return {
    request: {
      params: idParamsSchema({ idType }),
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Single record matching ID or null',
      schema: config?.response?.schema ?? conditionalCountResponse(selectSchema),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

export const resolveFindOneConfig = <FindOneSchema extends TAnyObjectSchema>(opts: {
  config: TRoutesConfig['findOne'];
  selectSchema: FindOneSchema;
}) => {
  const { config, selectSchema } = opts;
  const defaultQuery = z.object({ filter: FilterSchema }).openapi({
    description: 'Filter with where, fields, order, include',
  });
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'First matching record or null',
      schema: config?.response?.schema ?? conditionalCountResponse(selectSchema),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

export const resolveCreateConfig = <
  SelectSchema extends TAnyObjectSchema,
  CreateSchema extends TAnyObjectSchema,
>(opts: {
  config: TRoutesConfig['create'];
  selectSchema: SelectSchema;
  createSchema: CreateSchema;
}) => {
  const { config, selectSchema, createSchema } = opts;
  return {
    request: {
      body: config?.request?.body ?? createSchema,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Created record with generated fields (id, createdAt, etc.)',
      schema: config?.response?.schema ?? conditionalCountResponse(selectSchema),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveUpdateByIdConfig = <
  SelectSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  idType: ReturnType<typeof getIdType>;
  config: TRoutesConfig['updateById'];
  selectSchema: SelectSchema;
  updateSchema: UpdateSchema;
}) => {
  const { config, selectSchema, updateSchema, idType } = opts;
  return {
    request: {
      params: idParamsSchema({ idType }),
      body: config?.request?.body ?? updateSchema,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Updated record with all current fields',
      schema: config?.response?.schema ?? conditionalCountResponse(selectSchema),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveUpdateByConfig = <
  SelectSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  config: TRoutesConfig['updateBy'];
  selectSchema: SelectSchema;
  updateSchema: UpdateSchema;
}) => {
  const { config, selectSchema, updateSchema } = opts;
  const defaultQuery = z.object({ where: WhereSchema }).openapi({
    description: 'Required where condition to select records for update',
  });
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      body: config?.request?.body ?? updateSchema,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Array of updated records',
      schema: config?.response?.schema ?? conditionalCountResponse(z.array(selectSchema)),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveDeleteByIdConfig = <SelectSchema extends TAnyObjectSchema>(opts: {
  idType: ReturnType<typeof getIdType>;
  config: TRoutesConfig['deleteById'];
  selectSchema: SelectSchema;
}) => {
  const { config, selectSchema, idType } = opts;
  return {
    request: {
      params: idParamsSchema({ idType }),
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Deleted record data',
      schema: config?.response?.schema ?? conditionalCountResponse(selectSchema),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveDeleteByConfig = <SelectSchema extends TAnyObjectSchema>(opts: {
  config: TRoutesConfig['deleteBy'];
  selectSchema: SelectSchema;
}) => {
  const { config, selectSchema } = opts;
  const defaultQuery = z.object({ where: WhereSchema }).openapi({
    description: 'Required where condition to select records for deletion',
  });
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Array of deleted records',
      schema: config?.response?.schema ?? conditionalCountResponse(z.array(selectSchema)),
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

// -----------------------------------------------------------------------------
// Route Configs Generator
// -----------------------------------------------------------------------------

/**
 * Generates complete route configurations for a CRUD controller.
 * Generic over Routes to preserve custom schema types for proper type inference.
 */
export const defineControllerRouteConfigs = <
  Routes extends TRoutesConfig,
  SelectSchema extends TAnyObjectSchema,
  CreateSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  isStrict: boolean;
  idType: ReturnType<typeof getIdType>;
  authStrategies?: Array<TAuthStrategy>;
  schema: {
    select: SelectSchema;
    create: CreateSchema;
    update: UpdateSchema;
  };
  routes?: Routes;
}) => {
  const {
    isStrict,
    idType,
    authStrategies = [],
    schema: { select: selectSchema, create: createSchema, update: updateSchema },
    routes,
  } = opts;

  // Type-safe routes access (Routes may be undefined)
  const routesConfig = (routes ?? {}) as Routes;

  /**
   * Resolves auth strategies for a specific route.
   */
  const resolveRouteAuth = (routeKey: keyof TRoutesConfig): Array<TAuthStrategy> => {
    const endpointConfig = routesConfig[routeKey];

    if (endpointConfig?.skipAuth) {
      return [];
    }

    if (endpointConfig?.authStrategies) {
      return endpointConfig.authStrategies;
    }

    return authStrategies;
  };

  // -------------------------------------------------------------------------
  // Resolve route configs using external resolvers
  // -------------------------------------------------------------------------
  const count = resolveCountConfig({ config: routesConfig.count, isStrict });
  const find = resolveFindConfig({ config: routesConfig.find, selectSchema });
  const findById = resolveFindByIdConfig({ config: routesConfig.findById, selectSchema, idType });
  const findOne = resolveFindOneConfig({ config: routesConfig.findOne, selectSchema });
  const create = resolveCreateConfig({ config: routesConfig.create, selectSchema, createSchema });
  const updateById = resolveUpdateByIdConfig({
    config: routesConfig.updateById,
    selectSchema,
    updateSchema,
    idType,
  });
  const updateBy = resolveUpdateByConfig({
    config: routesConfig.updateBy,
    selectSchema,
    updateSchema,
  });
  const deleteById = resolveDeleteByIdConfig({
    config: routesConfig.deleteById,
    selectSchema,
    idType,
  });
  const deleteBy = resolveDeleteByConfig({ config: routesConfig.deleteBy, selectSchema });

  // -------------------------------------------------------------------------
  // Define route configurations
  // -------------------------------------------------------------------------
  const rs = {
    COUNT: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.COUNT,
      description: 'Count records matching where condition',
      authStrategies: resolveRouteAuth('count'),
      request: count.request,
      responses: jsonResponse(count.response),
    }),

    FIND: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.ROOT,
      description: 'Find records with filter, pagination, sorting, and relations',
      authStrategies: resolveRouteAuth('find'),
      request: find.request,
      responses: jsonResponse(find.response),
    }),

    FIND_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: '/{id}',
      description: 'Find single record by ID',
      authStrategies: resolveRouteAuth('findById'),
      request: findById.request,
      responses: jsonResponse(findById.response),
    }),

    FIND_ONE: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.FIND_ONE,
      description: 'Find first record matching filter',
      authStrategies: resolveRouteAuth('findOne'),
      request: findOne.request,
      responses: jsonResponse(findOne.response),
    }),

    CREATE: defineRouteConfigs({
      method: HTTP.Methods.POST,
      path: RestPaths.ROOT,
      description: 'Create new record',
      authStrategies: resolveRouteAuth('create'),
      request: {
        body: jsonContent({
          description: 'Record data (required fields must be provided)',
          // Cast to preserve the custom body schema type from routes config
          schema: create.request.body,
        }),
        headers: create.request.headers,
      },
      responses: jsonResponse(create.response),
    }),

    UPDATE_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.PATCH,
      path: '/{id}',
      description: 'Partial update record by ID',
      authStrategies: resolveRouteAuth('updateById'),
      request: {
        params: updateById.request.params,
        body: jsonContent({
          description: 'Partial data (only changed fields)',
          schema: updateById.request.body,
        }),
        headers: updateById.request.headers,
      },
      responses: jsonResponse(updateById.response),
    }),

    UPDATE_BY: defineRouteConfigs({
      method: HTTP.Methods.PATCH,
      path: RestPaths.ROOT,
      description: 'Bulk update records matching where condition',
      authStrategies: resolveRouteAuth('updateBy'),
      request: {
        query: updateBy.request.query,
        body: jsonContent({
          description: 'Partial data to apply to all matches',
          schema: updateBy.request.body,
        }),
        headers: updateBy.request.headers,
      },
      responses: jsonResponse(updateBy.response),
    }),

    DELETE_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.DELETE,
      path: '/{id}',
      description: 'Delete record by ID (irreversible)',
      authStrategies: resolveRouteAuth('deleteById'),
      request: deleteById.request,
      responses: jsonResponse(deleteById.response),
    }),

    DELETE_BY: defineRouteConfigs({
      method: HTTP.Methods.DELETE,
      path: RestPaths.ROOT,
      description: 'Bulk delete records matching where condition (irreversible)',
      authStrategies: resolveRouteAuth('deleteBy'),
      request: deleteBy.request,
      responses: jsonResponse(deleteBy.response),
    }),
  } as const;

  return rs;
};
