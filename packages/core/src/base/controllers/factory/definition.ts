import { RouteConfig, z } from '@hono/zod-openapi';
import { RestPaths, TAuthRouteConfig } from '../common';
import { HTTP } from '@venizia/ignis-helpers';
import { CountSchema, FilterSchema, WhereSchema } from '@/base/repositories';
import { getIdType, idParamsSchema, jsonContent, jsonResponse } from '@/base/models';

export const defineRouteConfigs = <RC extends TAuthRouteConfig<RouteConfig>>(configs: RC) => {
  return configs;
};

export const defineControllerRouteConfigs = (opts: {
  isStrict: boolean;
  idType: ReturnType<typeof getIdType>;
  schema: {
    select: z.ZodObject;
    create: z.ZodObject;
    update: z.ZodObject;
    overrided?: {
      count?: z.ZodObject;
      find?: z.ZodObject;
      findOne?: z.ZodObject;
      findById?: z.ZodObject;

      create?: z.ZodObject;
      createRequestBody?: z.ZodObject;

      updateById?: z.ZodObject;
      updateByIdRequestBody?: z.ZodObject;

      updateBy?: z.ZodObject;
      updateByRequestBody?: z.ZodObject;

      deleteById?: z.ZodObject;
      deleteBy?: z.ZodObject;
    };
  };
}) => {
  const {
    isStrict,
    idType,
    schema: { select: selectSchema, create: createSchema, update: updateSchema, overrided },
  } = opts;

  const rs = {
    // -----------------------------------------------------------------------------
    // Count
    // -----------------------------------------------------------------------------
    COUNT: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.COUNT,
      request: {
        query: z.object({ where: isStrict ? WhereSchema : z.optional(WhereSchema) }),
      },
      responses: jsonResponse({ schema: overrided?.count ?? CountSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Find
    // -----------------------------------------------------------------------------
    FIND: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.ROOT,
      request: {
        query: z.object({ filter: FilterSchema }),
      },
      responses: jsonResponse({ schema: overrided?.find ?? selectSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Find by ID
    // -----------------------------------------------------------------------------
    FIND_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: '/:id',
      request: {
        params: idParamsSchema({ idType }),
        query: z.object({ filter: FilterSchema }),
      },
      responses: jsonResponse({ schema: overrided?.findById ?? selectSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Find One
    // -----------------------------------------------------------------------------
    FIND_ONE: defineRouteConfigs({
      method: HTTP.Methods.GET,
      path: RestPaths.FIND_ONE,
      request: {
        query: z.object({ filter: FilterSchema }),
      },
      responses: jsonResponse({ schema: overrided?.findOne ?? selectSchema }),
    }),

    // -----------------------------------------------------------------------------
    // Create
    // -----------------------------------------------------------------------------
    CREATE: defineRouteConfigs({
      method: HTTP.Methods.POST,
      path: RestPaths.ROOT,
      request: {
        body: jsonContent({
          description: 'CREATE | Request body',
          schema: overrided?.createRequestBody ?? createSchema,
        }),
      },
      responses: jsonResponse({
        schema: overrided?.create ?? z.object({ count: CountSchema, data: selectSchema }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Update by ID
    // -----------------------------------------------------------------------------
    UPDATE_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.PATCH,
      path: '/:id',
      request: {
        params: idParamsSchema({ idType }),
        body: jsonContent({
          description: 'UPDATE BY ID | Request body',
          schema: overrided?.updateByIdRequestBody ?? updateSchema,
        }),
      },
      responses: jsonResponse({
        schema: overrided?.updateById ?? z.object({ count: CountSchema, data: selectSchema }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Update by
    // -----------------------------------------------------------------------------
    UPDATE_BY: defineRouteConfigs({
      method: HTTP.Methods.PATCH,
      path: RestPaths.ROOT,
      request: {
        query: z.object({ where: WhereSchema }),
        body: jsonContent({
          description: 'UPDATE BY CONDITION | Request body',
          schema: overrided?.updateByRequestBody ?? updateSchema,
        }),
      },
      responses: jsonResponse({
        schema:
          overrided?.updateBy ?? z.object({ count: CountSchema, data: z.array(selectSchema) }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Delete by ID
    // -----------------------------------------------------------------------------
    DELETE_BY_ID: defineRouteConfigs({
      method: HTTP.Methods.DELETE,
      path: '/:id',
      request: {
        params: idParamsSchema({ idType }),
      },
      responses: jsonResponse({
        schema: overrided?.deleteById ?? z.object({ count: CountSchema, data: selectSchema }),
      }),
    }),

    // -----------------------------------------------------------------------------
    // Delete by
    // -----------------------------------------------------------------------------
    DELETE_BY: defineRouteConfigs({
      method: HTTP.Methods.DELETE,
      path: RestPaths.ROOT,
      request: {
        query: z.object({ where: WhereSchema }),
      },
      responses: jsonResponse({
        schema:
          overrided?.deleteBy ?? z.object({ count: CountSchema, data: z.array(selectSchema) }),
      }),
    }),
  } as const;

  return rs;
};
