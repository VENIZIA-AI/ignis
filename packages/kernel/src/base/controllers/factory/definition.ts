import type { TAuthMode, TAuthStrategy } from '@/base/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { TIdSchemaType } from '@/base/models/common';
import { idParamsSchema, jsonContent, jsonResponse } from '@/base/models/common';
import { CountSchema } from '@/base/repositories/common';
import { FilterQuerySchema, WhereSchema } from '@/base/repositories/query-schemas';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { ICustomizableRoutes } from '../common';
import {
  commonResponseHeaders,
  defaultRequestHeaders,
  findResponseHeaders,
  RestPaths,
  trackableHeaders,
} from '../common';

/** Picks user-overridden response schema if present (and non-undefined), else the default. */
type TResolvedResponseSchema<C, D extends z.ZodType> = C extends {
  response: {
    schema: infer S extends z.ZodType;
  };
}
  ? S
  : D;

/**
 * Every method here is an unbound static, called from the exported aliases below without a
 * receiver - a method must call another via `RouteConfigResolver.other(...)`, never
 * `this.other(...)`, or `this` is `undefined` at the call site.
 */
export class RouteConfigResolver {
  /** Path params always reach the validator as strings, so a number-typed id must be coerced before `z.number()` sees it - `idParamsSchema` alone rejects `/accounts/7`. */
  private static idPathParamsSchema(opts: { idType: TIdSchemaType }) {
    const { idType } = opts;

    if (idType !== 'number') {
      return idParamsSchema({ idType });
    }

    return z.object({
      id: z.coerce.number().openapi({
        param: { name: 'id', in: 'path', description: 'The unique id of the resource' },
        examples: [1, 2, 3],
      }),
    });
  }

  /**
   * The default body of a write route: the entity schema without the keys the entity stamps, and on
   * an update without `id` - the path or `where` names the rows. Zod strips a left-out key a client
   * sends. With nothing to leave out the schema itself is the body, refinements and OpenAPI name kept.
   */
  private static toWriteBodySchema(opts: {
    schema: TAnyObjectSchema;
    route: keyof ICustomizableRoutes;
    serverStampedKeys: string[];
  }): TAnyObjectSchema {
    const { schema, route, serverStampedKeys } = opts;
    const droppedKeys = route === 'create' ? serverStampedKeys : [...serverStampedKeys, 'id'];
    // A `.transform()` pipe has no shape to read, so every key it might hold counts.
    const isObjectSchema = schema instanceof z.ZodObject;
    const omittedKeys = isObjectSchema
      ? droppedKeys.filter(key => Object.hasOwn(schema.shape, key))
      : droppedKeys;

    if (omittedKeys.length === 0) {
      return schema;
    }

    if (!isObjectSchema || schema.def.checks?.length) {
      throw getError({
        message: `[defineControllerRouteConfigs] Cannot build the default ${route} body | keys to leave out: ${omittedKeys.join(', ')} | The schema is refined or transformed, so zod cannot remove them | Pass routes.${route}.request.body`,
      });
    }

    const mask: Record<string, true> = {};
    for (const key of omittedKeys) {
      mask[key] = true;
    }

    return schema.omit(mask);
  }

  /** Picks the caller's per-route `request.params` override, else the entity's id path-param schema. */
  private static resolveIdParams<
    C extends { request?: { params?: TAnyObjectSchema } } | undefined,
  >(opts: { config: C; idType: TIdSchemaType }) {
    const { config, idType } = opts;
    return config?.request?.params ?? RouteConfigResolver.idPathParamsSchema({ idType });
  }

  /** Creates conditional count response schema. */
  static conditionalCountResponse<T extends z.ZodType>(dataSchema: T) {
    return z.union([
      CountSchema.extend({ data: dataSchema }).openapi({
        description: 'Response with count (when x-request-count header is "true" or omitted)',
      }),
      dataSchema.openapi({
        description: 'Data only response (when x-request-count header is "false")',
      }),
    ]);
  }

  /** Resolves a route's response schema - user override or default. Holds the one cast every `resolve*Config` needs: generic `C` is only known by its wider structural constraint, so it cannot be proven at the value level to collapse to `TResolvedResponseSchema`. */
  private static resolveResponseSchema<
    C extends { response?: { schema?: z.ZodType } } | undefined,
    D extends z.ZodType,
  >(opts: { config: C; defaultSchema: D }): TResolvedResponseSchema<C, D> {
    const { config, defaultSchema } = opts;
    return (config?.response?.schema ?? defaultSchema) as TResolvedResponseSchema<C, D>;
  }

  static resolveCountConfig<C extends ICustomizableRoutes['count']>(opts: {
    config: C;
    isStrict: boolean;
  }) {
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
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema: CountSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  static resolveFindConfig<
    C extends ICustomizableRoutes['find'],
    FindSchema extends TAnyObjectSchema,
  >(opts: { config: C; selectSchema: FindSchema }) {
    const { config, selectSchema } = opts;
    const defaultQuery = FilterQuerySchema;
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(z.array(selectSchema));

    return {
      request: {
        query: config?.request?.query ?? defaultQuery,
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Array of matching records (with optional count)',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? findResponseHeaders,
      },
    };
  }

  static resolveFindByIdConfig<
    C extends ICustomizableRoutes['findById'],
    FindByIdSchema extends TAnyObjectSchema,
  >(opts: { idType: TIdSchemaType; config: C; selectSchema: FindByIdSchema }) {
    const { config, selectSchema, idType } = opts;
    const defaultQuery = FilterQuerySchema.openapi({
      description: 'Filter with fields, order, include (where ignored)',
    });
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(selectSchema);

    return {
      request: {
        params: RouteConfigResolver.resolveIdParams({ config, idType }),
        query: config?.request?.query ?? defaultQuery,
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Single record matching ID or null',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  static resolveFindOneConfig<
    C extends ICustomizableRoutes['findOne'],
    FindOneSchema extends TAnyObjectSchema,
  >(opts: { config: C; selectSchema: FindOneSchema }) {
    const { config, selectSchema } = opts;
    const defaultQuery = FilterQuerySchema.openapi({
      description: 'Filter with where, fields, order, include',
    });
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(selectSchema);

    return {
      request: {
        query: config?.request?.query ?? defaultQuery,
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'First matching record or null',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  /** `serverStampedKeys` - what the entity reports from `getServerStampedKeys()`; the default body leaves them out. */
  static resolveCreateConfig<
    C extends ICustomizableRoutes['create'],
    SelectSchema extends TAnyObjectSchema,
    CreateSchema extends TAnyObjectSchema,
  >(opts: {
    config: C;
    selectSchema: SelectSchema;
    createSchema: CreateSchema;
    serverStampedKeys?: string[];
  }) {
    const { config, selectSchema, createSchema, serverStampedKeys = [] } = opts;
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(selectSchema);

    return {
      request: {
        body:
          config?.request?.body ??
          RouteConfigResolver.toWriteBodySchema({
            schema: createSchema,
            route: 'create',
            serverStampedKeys,
          }),
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Created record with generated fields (id, createdAt, etc.)',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  private static resolveUpdateByIdConfig<
    C extends ICustomizableRoutes['updateById'],
    SelectSchema extends TAnyObjectSchema,
    UpdateSchema extends TAnyObjectSchema,
  >(opts: {
    idType: TIdSchemaType;
    config: C;
    selectSchema: SelectSchema;
    updateSchema: UpdateSchema;
    serverStampedKeys: string[];
  }) {
    const { config, selectSchema, updateSchema, idType, serverStampedKeys } = opts;
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(selectSchema);
    return {
      request: {
        params: RouteConfigResolver.resolveIdParams({ config, idType }),
        body:
          config?.request?.body ??
          RouteConfigResolver.toWriteBodySchema({
            schema: updateSchema,
            route: 'updateById',
            serverStampedKeys,
          }),
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Updated record with all current fields',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  private static resolveUpdateByConfig<
    C extends ICustomizableRoutes['updateBy'],
    SelectSchema extends TAnyObjectSchema,
    UpdateSchema extends TAnyObjectSchema,
  >(opts: {
    config: C;
    selectSchema: SelectSchema;
    updateSchema: UpdateSchema;
    serverStampedKeys: string[];
  }) {
    const { config, selectSchema, updateSchema, serverStampedKeys } = opts;
    const defaultQuery = z.object({ where: WhereSchema.optional() }).openapi({
      description:
        'Where condition selecting the records to update - here or in the body, not both',
    });
    // Built only without a custom body: a custom body must not trip the entity schema's checks.
    const buildDefaultBody = () => {
      const writableSchema = RouteConfigResolver.toWriteBodySchema({
        schema: updateSchema,
        route: 'updateBy',
        serverStampedKeys,
      });
      // A model with a real `where` column keeps it: the body reserves the name only when it is
      // free, and the handler then simply finds no `where` there.
      return 'where' in writableSchema.shape
        ? writableSchema
        : writableSchema.extend({ where: WhereSchema.optional() });
    };
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(z.array(selectSchema));
    return {
      request: {
        query: config?.request?.query ?? defaultQuery,
        body: config?.request?.body ?? buildDefaultBody(),
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Array of updated records',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  private static resolveDeleteByIdConfig<
    C extends ICustomizableRoutes['deleteById'],
    SelectSchema extends TAnyObjectSchema,
  >(opts: { idType: TIdSchemaType; config: C; selectSchema: SelectSchema }) {
    const { config, selectSchema, idType } = opts;
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(selectSchema);
    return {
      request: {
        params: RouteConfigResolver.resolveIdParams({ config, idType }),
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Deleted record data',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  private static resolveDeleteByConfig<
    C extends ICustomizableRoutes['deleteBy'],
    SelectSchema extends TAnyObjectSchema,
  >(opts: { config: C; selectSchema: SelectSchema }) {
    const { config, selectSchema } = opts;
    const defaultQuery = z.object({ where: WhereSchema.optional() }).openapi({
      description:
        'Where condition selecting the records to delete - here or in the body, not both',
    });
    const defaultSchema = RouteConfigResolver.conditionalCountResponse(z.array(selectSchema));
    return {
      request: {
        query: config?.request?.query ?? defaultQuery,
        // No DEFAULT body schema. Declaring one makes `@hono/zod-openapi` gate the media type, and a
        // client that sends `content-type: application/json` with no body then gets 400 where it used
        // to get 200. The handler reads the body itself; name one here to get the Swagger editor.
        body: config?.request?.body,
        headers: config?.request?.headers ?? defaultRequestHeaders,
      },
      response: {
        description: 'Array of deleted records',
        schema: RouteConfigResolver.resolveResponseSchema({ config, defaultSchema }),
        headers: config?.response?.headers ?? commonResponseHeaders,
      },
    };
  }

  /**
   * Generates complete route configurations for a CRUD controller. `serverStampedKeys` - what the
   * entity reports from `getServerStampedKeys()`; the default write bodies leave them out.
   */
  static defineControllerRouteConfigs<
    Routes extends ICustomizableRoutes,
    SelectSchema extends TAnyObjectSchema,
    CreateSchema extends TAnyObjectSchema,
    UpdateSchema extends TAnyObjectSchema,
  >(opts: {
    isStrict: boolean;
    idType: TIdSchemaType;
    authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    schema: { select: SelectSchema; create: CreateSchema; update: UpdateSchema };
    serverStampedKeys?: string[];
    routes?: Routes;
  }) {
    const {
      isStrict,
      idType,
      authenticate: controllerAuth = {},
      authorize: controllerAuthorize,
      schema: { select: selectSchema, create: createSchema, update: updateSchema },
      serverStampedKeys = [],
      routes,
    } = opts;
    const { strategies: defaultStrategies = [], mode: defaultMode } = controllerAuth;

    // `Routes` is caller-bound but otherwise unconstrained here, so `{}` cannot be proven to satisfy it structurally even though every field ICustomizableRoutes declares is optional.
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

      if (Array.isArray(authorize)) {
        return authorize;
      }

      if ('skip' in authorize) {
        return undefined;
      }

      return authorize;
    };

    const count = RouteConfigResolver.resolveCountConfig({ config: routesConfig.count, isStrict });
    const find = RouteConfigResolver.resolveFindConfig({ config: routesConfig.find, selectSchema });
    const findById = RouteConfigResolver.resolveFindByIdConfig({
      config: routesConfig.findById,
      selectSchema,
      idType,
    });
    const findOne = RouteConfigResolver.resolveFindOneConfig({
      config: routesConfig.findOne,
      selectSchema,
    });
    const create = RouteConfigResolver.resolveCreateConfig({
      config: routesConfig.create,
      selectSchema,
      createSchema,
      serverStampedKeys,
    });
    const updateById = RouteConfigResolver.resolveUpdateByIdConfig({
      config: routesConfig.updateById,
      selectSchema,
      updateSchema,
      idType,
      serverStampedKeys,
    });
    const updateBy = RouteConfigResolver.resolveUpdateByConfig({
      config: routesConfig.updateBy,
      selectSchema,
      updateSchema,
      serverStampedKeys,
    });
    const deleteById = RouteConfigResolver.resolveDeleteByIdConfig({
      config: routesConfig.deleteById,
      selectSchema,
      idType,
    });
    const deleteBy = RouteConfigResolver.resolveDeleteByConfig({
      config: routesConfig.deleteBy,
      selectSchema,
    });

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
        request: {
          query: deleteBy.request.query,
          ...(deleteBy.request.body
            ? {
                body: jsonContent({
                  description: 'Where condition, when it does not fit in the query',
                  schema: deleteBy.request.body,
                  required: false,
                }),
              }
            : {}),
          headers: deleteBy.request.headers,
        },
        responses: jsonResponse(deleteBy.response),
      },
    } as const;

    return rs;
  }
}

export const conditionalCountResponse = RouteConfigResolver.conditionalCountResponse;
export const resolveCountConfig = RouteConfigResolver.resolveCountConfig;
export const resolveFindConfig = RouteConfigResolver.resolveFindConfig;
export const resolveFindByIdConfig = RouteConfigResolver.resolveFindByIdConfig;
export const resolveFindOneConfig = RouteConfigResolver.resolveFindOneConfig;
export const resolveCreateConfig = RouteConfigResolver.resolveCreateConfig;
export const defineControllerRouteConfigs = RouteConfigResolver.defineControllerRouteConfigs;
