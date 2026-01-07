import { getIdType, idParamsSchema, jsonContent, jsonResponse } from '@/base/models';
import { CountSchema, FilterSchema, WhereSchema } from '@/base/repositories';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers';
import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common';
import {
  commonResponseHeaders,
  RestPaths,
  trackableHeaders,
  ICustomizableRoutes,
  defaultRequestHeaders,
  findResponseHeaders,
} from '../common';
import { TAnyObjectSchema } from '@/utilities/schema.utility';

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
export const resolveCountConfig = (opts: {
  config: ICustomizableRoutes['count'];
  isStrict: boolean;
}) => {
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
  config: ICustomizableRoutes['find'];
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
  config: ICustomizableRoutes['findById'];
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
  config: ICustomizableRoutes['findOne'];
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
  config: ICustomizableRoutes['create'];
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
  config: ICustomizableRoutes['updateById'];
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
  config: ICustomizableRoutes['updateBy'];
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
  config: ICustomizableRoutes['deleteById'];
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
  config: ICustomizableRoutes['deleteBy'];
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
  Routes extends ICustomizableRoutes,
  SelectSchema extends TAnyObjectSchema,
  CreateSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  isStrict: boolean;
  idType: ReturnType<typeof getIdType>;
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
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
    authenticate: controllerAuth = {},
    schema: { select: selectSchema, create: createSchema, update: updateSchema },
    routes,
  } = opts;
  const { strategies: defaultStrategies = [], mode: defaultMode } = controllerAuth;

  // Type-safe routes access (Routes may be undefined)
  const routesConfig = (routes ?? {}) as Routes;

  type TAuthenticateConfig = { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /**
   * Resolves authentication config for a specific route.
   * Priority: endpoint config > controller config
   */
  const resolveRouteAuth = (routeKey: keyof ICustomizableRoutes): TAuthenticateConfig => {
    const endpointConfig = routesConfig[routeKey];

    if (endpointConfig?.skipAuth) {
      return { strategies: [] };
    }

    if (endpointConfig?.authenticate) {
      return {
        strategies: endpointConfig.authenticate.strategies ?? defaultStrategies,
        mode: endpointConfig.authenticate.mode ?? defaultMode,
      };
    }

    return { strategies: defaultStrategies, mode: defaultMode };
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
    COUNT: {
      method: HTTP.Methods.GET,
      path: RestPaths.COUNT,
      description: 'Count records matching where condition',
      authenticate: resolveRouteAuth('count'),
      request: count.request,
      responses: jsonResponse(count.response),
    },

    FIND: {
      method: HTTP.Methods.GET,
      path: RestPaths.ROOT,
      description: 'Find records with filter, pagination, sorting, and relations',
      authenticate: resolveRouteAuth('find'),
      request: find.request,
      responses: jsonResponse(find.response),
    },

    FIND_BY_ID: {
      method: HTTP.Methods.GET,
      path: '/{id}',
      description: 'Find single record by ID',
      authenticate: resolveRouteAuth('findById'),
      request: findById.request,
      responses: jsonResponse(findById.response),
    },

    FIND_ONE: {
      method: HTTP.Methods.GET,
      path: RestPaths.FIND_ONE,
      description: 'Find first record matching filter',
      authenticate: resolveRouteAuth('findOne'),
      request: findOne.request,
      responses: jsonResponse(findOne.response),
    },

    CREATE: {
      method: HTTP.Methods.POST,
      path: RestPaths.ROOT,
      description: 'Create new record',
      authenticate: resolveRouteAuth('create'),
      request: {
        body: jsonContent({
          description: 'Record data (required fields must be provided)',
          // Cast to preserve the custom body schema type from routes config
          schema: create.request.body,
        }),
        headers: create.request.headers,
      },
      responses: jsonResponse(create.response),
    },

    UPDATE_BY_ID: {
      method: HTTP.Methods.PATCH,
      path: '/{id}',
      description: 'Partial update record by ID',
      authenticate: resolveRouteAuth('updateById'),
      request: {
        params: updateById.request.params,
        body: jsonContent({
          description: 'Partial data (only changed fields)',
          schema: updateById.request.body,
        }),
        headers: updateById.request.headers,
      },
      responses: jsonResponse(updateById.response),
    },

    UPDATE_BY: {
      method: HTTP.Methods.PATCH,
      path: RestPaths.ROOT,
      description: 'Bulk update records matching where condition',
      authenticate: resolveRouteAuth('updateBy'),
      request: {
        query: updateBy.request.query,
        body: jsonContent({
          description: 'Partial data to apply to all matches',
          schema: updateBy.request.body,
        }),
        headers: updateBy.request.headers,
      },
      responses: jsonResponse(updateBy.response),
    },

    DELETE_BY_ID: {
      method: HTTP.Methods.DELETE,
      path: '/{id}',
      description: 'Delete record by ID (irreversible)',
      authenticate: resolveRouteAuth('deleteById'),
      request: deleteById.request,
      responses: jsonResponse(deleteById.response),
    },

    DELETE_BY: {
      method: HTTP.Methods.DELETE,
      path: RestPaths.ROOT,
      description: 'Bulk delete records matching where condition (irreversible)',
      authenticate: resolveRouteAuth('deleteBy'),
      request: deleteBy.request,
      responses: jsonResponse(deleteBy.response),
    },
  } as const;

  return rs;
};
