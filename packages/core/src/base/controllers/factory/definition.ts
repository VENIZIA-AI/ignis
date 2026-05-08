import { getIdType, idParamsSchema, jsonContent, jsonResponse } from '@/base/models/common/types';
import { CountSchema, FilterSchema, WhereSchema } from '@/base/repositories/common/types';
import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common/constants';
import { IAuthorizationSpec } from '@/components/auth/authorize/common/types';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers';
import {
  commonResponseHeaders,
  defaultRequestHeaders,
  findResponseHeaders,
  ICustomizableRoutes,
  RestPaths,
  trackableHeaders,
} from '../common';

/** Creates conditional count response schema. */
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

/** Picks user-overridden response schema if present (and non-undefined), else the default. */
type TResolvedResponseSchema<C, D extends z.ZodTypeAny> = C extends {
  response: { schema: infer S extends z.ZodTypeAny };
}
  ? S
  : D;

export const resolveCountConfig = <C extends ICustomizableRoutes['count']>(opts: {
  config: C;
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
      schema: (config?.response?.schema ?? CountSchema) as TResolvedResponseSchema<
        C,
        typeof CountSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

export const resolveFindConfig = <
  C extends ICustomizableRoutes['find'],
  FindSchema extends TAnyObjectSchema,
>(opts: {
  config: C;
  selectSchema: FindSchema;
}) => {
  const { config, selectSchema } = opts;
  const defaultQuery = z.object({ filter: FilterSchema }).openapi({
    description: 'Filter with where, fields, limit, skip, order, include',
  });
  const defaultSchema = conditionalCountResponse(z.array(selectSchema));
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Array of matching records (with optional count)',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? findResponseHeaders,
    },
  };
};

export const resolveFindByIdConfig = <
  C extends ICustomizableRoutes['findById'],
  FindByIdSchema extends TAnyObjectSchema,
>(opts: {
  idType: ReturnType<typeof getIdType>;
  config: C;
  selectSchema: FindByIdSchema;
}) => {
  const { config, selectSchema, idType } = opts;
  const defaultQuery = z.object({ filter: FilterSchema }).openapi({
    description: 'Filter with fields, order, include (where ignored)',
  });
  const defaultSchema = conditionalCountResponse(selectSchema);
  return {
    request: {
      params: idParamsSchema({ idType }),
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Single record matching ID or null',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

export const resolveFindOneConfig = <
  C extends ICustomizableRoutes['findOne'],
  FindOneSchema extends TAnyObjectSchema,
>(opts: {
  config: C;
  selectSchema: FindOneSchema;
}) => {
  const { config, selectSchema } = opts;
  const defaultQuery = z.object({ filter: FilterSchema }).openapi({
    description: 'Filter with where, fields, order, include',
  });
  const defaultSchema = conditionalCountResponse(selectSchema);
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'First matching record or null',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

export const resolveCreateConfig = <
  C extends ICustomizableRoutes['create'],
  SelectSchema extends TAnyObjectSchema,
  CreateSchema extends TAnyObjectSchema,
>(opts: {
  config: C;
  selectSchema: SelectSchema;
  createSchema: CreateSchema;
}) => {
  const { config, selectSchema, createSchema } = opts;
  const defaultSchema = conditionalCountResponse(selectSchema);
  return {
    request: {
      body: config?.request?.body ?? createSchema,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Created record with generated fields (id, createdAt, etc.)',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveUpdateByIdConfig = <
  C extends ICustomizableRoutes['updateById'],
  SelectSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  idType: ReturnType<typeof getIdType>;
  config: C;
  selectSchema: SelectSchema;
  updateSchema: UpdateSchema;
}) => {
  const { config, selectSchema, updateSchema, idType } = opts;
  const defaultSchema = conditionalCountResponse(selectSchema);
  return {
    request: {
      params: idParamsSchema({ idType }),
      body: config?.request?.body ?? updateSchema,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Updated record with all current fields',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveUpdateByConfig = <
  C extends ICustomizableRoutes['updateBy'],
  SelectSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  config: C;
  selectSchema: SelectSchema;
  updateSchema: UpdateSchema;
}) => {
  const { config, selectSchema, updateSchema } = opts;
  const defaultQuery = z.object({ where: WhereSchema }).openapi({
    description: 'Required where condition to select records for update',
  });
  const defaultSchema = conditionalCountResponse(z.array(selectSchema));
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      body: config?.request?.body ?? updateSchema,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Array of updated records',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveDeleteByIdConfig = <
  C extends ICustomizableRoutes['deleteById'],
  SelectSchema extends TAnyObjectSchema,
>(opts: {
  idType: ReturnType<typeof getIdType>;
  config: C;
  selectSchema: SelectSchema;
}) => {
  const { config, selectSchema, idType } = opts;
  const defaultSchema = conditionalCountResponse(selectSchema);
  return {
    request: {
      params: idParamsSchema({ idType }),
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Deleted record data',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

const resolveDeleteByConfig = <
  C extends ICustomizableRoutes['deleteBy'],
  SelectSchema extends TAnyObjectSchema,
>(opts: {
  config: C;
  selectSchema: SelectSchema;
}) => {
  const { config, selectSchema } = opts;
  const defaultQuery = z.object({ where: WhereSchema }).openapi({
    description: 'Required where condition to select records for deletion',
  });
  const defaultSchema = conditionalCountResponse(z.array(selectSchema));
  return {
    request: {
      query: config?.request?.query ?? defaultQuery,
      headers: config?.request?.headers ?? defaultRequestHeaders,
    },
    response: {
      description: 'Array of deleted records',
      schema: (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<
        C,
        typeof defaultSchema
      >,
      headers: config?.response?.headers ?? commonResponseHeaders,
    },
  };
};

/** Generates complete route configurations for a CRUD controller. */
export const defineControllerRouteConfigs = <
  Routes extends ICustomizableRoutes,
  SelectSchema extends TAnyObjectSchema,
  CreateSchema extends TAnyObjectSchema,
  UpdateSchema extends TAnyObjectSchema,
>(opts: {
  isStrict: boolean;
  idType: ReturnType<typeof getIdType>;
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
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
    authorize: controllerAuthorize,
    schema: { select: selectSchema, create: createSchema, update: updateSchema },
    routes,
  } = opts;
  const { strategies: defaultStrategies = [], mode: defaultMode } = controllerAuth;

  const routesConfig = (routes ?? {}) as Routes;

  type TAuthenticateConfig = { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Priority: endpoint authenticate > controller authenticate. */
  const resolveRouteAuth = (routeKey: keyof ICustomizableRoutes): TAuthenticateConfig => {
    const endpointConfig = routesConfig[routeKey];
    const authConfig = endpointConfig?.authenticate;

    if (authConfig == null) {
      return { strategies: defaultStrategies, mode: defaultMode };
    }

    if (authConfig.skip === true) {
      return { strategies: [] };
    }

    return {
      strategies: authConfig.strategies ?? defaultStrategies,
      mode: authConfig.mode ?? defaultMode,
    };
  };

  type TAuthorizeConfig = IAuthorizationSpec | IAuthorizationSpec[] | undefined;

  /** Priority: endpoint authenticate.skip > endpoint authorize.skip > endpoint authorize > controller authorize. */
  const resolveRouteAuthorize = (routeKey: keyof ICustomizableRoutes): TAuthorizeConfig => {
    const endpointConfig = routesConfig[routeKey];

    if (endpointConfig?.authenticate?.skip === true) {
      return undefined;
    }

    const authorize = endpointConfig?.authorize;

    if (authorize == null) {
      return controllerAuthorize;
    }

    if (!Array.isArray(authorize) && 'skip' in authorize) {
      return undefined;
    }

    return authorize as TAuthorizeConfig;
  };

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

  const rs = {
    COUNT: {
      method: HTTP.Methods.GET,
      path: RestPaths.COUNT,
      description: 'Count records matching where condition',
      authenticate: resolveRouteAuth('count'),
      authorize: resolveRouteAuthorize('count'),
      request: count.request,
      responses: jsonResponse(count.response),
    },

    FIND: {
      method: HTTP.Methods.GET,
      path: RestPaths.ROOT,
      description: 'Find records with filter, pagination, sorting, and relations',
      authenticate: resolveRouteAuth('find'),
      authorize: resolveRouteAuthorize('find'),
      request: find.request,
      responses: jsonResponse(find.response),
    },

    FIND_BY_ID: {
      method: HTTP.Methods.GET,
      path: '/{id}',
      description: 'Find single record by ID',
      authenticate: resolveRouteAuth('findById'),
      authorize: resolveRouteAuthorize('findById'),
      request: findById.request,
      responses: jsonResponse(findById.response),
    },

    FIND_ONE: {
      method: HTTP.Methods.GET,
      path: RestPaths.FIND_ONE,
      description: 'Find first record matching filter',
      authenticate: resolveRouteAuth('findOne'),
      authorize: resolveRouteAuthorize('findOne'),
      request: findOne.request,
      responses: jsonResponse(findOne.response),
    },

    CREATE: {
      method: HTTP.Methods.POST,
      path: RestPaths.ROOT,
      description: 'Create new record',
      authenticate: resolveRouteAuth('create'),
      authorize: resolveRouteAuthorize('create'),
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
      authorize: resolveRouteAuthorize('updateById'),
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
      authorize: resolveRouteAuthorize('updateBy'),
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
      authorize: resolveRouteAuthorize('deleteById'),
      request: deleteById.request,
      responses: jsonResponse(deleteById.response),
    },

    DELETE_BY: {
      method: HTTP.Methods.DELETE,
      path: RestPaths.ROOT,
      description: 'Bulk delete records matching where condition (irreversible)',
      authenticate: resolveRouteAuth('deleteBy'),
      authorize: resolveRouteAuthorize('deleteBy'),
      request: deleteBy.request,
      responses: jsonResponse(deleteBy.response),
    },
  };

  return rs;
};
