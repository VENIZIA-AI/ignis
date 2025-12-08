import {
  BaseEntity,
  getIdType,
  idParamsSchema,
  jsonContent,
  jsonResponse,
  SchemaTypes,
  TTableSchemaWithId,
} from '@/base/models';
import {
  AbstractRepository,
  CountSchema,
  DEFAULT_LIMIT,
  FilterSchema,
  WhereSchema,
} from '@/base/repositories';
import { z } from '@hono/zod-openapi';
import {
  BaseHelper,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  isClass,
  TClass,
  TResolver,
  ValueOrPromise,
} from '@vez/ignis-helpers';
import { Env, Schema } from 'hono';
import { BaseController } from '../base';
import { RestPaths } from '../common';

export interface ICrudControllerOptions<EntitySchema extends TTableSchemaWithId> {
  entity: TClass<BaseEntity<EntitySchema>> | TResolver<TClass<BaseEntity<EntitySchema>>>;
  repository: { name: string };
  controller: {
    name: string;
    basePath: string;
    readonly?: boolean;
    isStrict?: boolean;
    defaultLimit?: number;
  };
  /* schema?: {
    find?: SchemaRef;
    findOne?: SchemaRef;
    findById?: SchemaRef;
    count?: SchemaRef;
    createRequestBody?: SchemaRef;
    create?: SchemaRef;
    updateAll?: SchemaRef;
    updateByIdRequestBody?: SchemaRef;
    updateById?: SchemaRef;
    replaceById?: SchemaRef;
    deleteById?: SchemaRef;
  }; */
  doDeleteWithReturn?: boolean;
}

export class ControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: ControllerFactory.name });
  }

  static defineCrudController<
    EntitySchema extends TTableSchemaWithId,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
  >(opts: ICrudControllerOptions<EntitySchema>) {
    const {
      controller,
      entity,
      // repository,
    } = opts;

    const {
      name,
      basePath = 'unknown_path',
      isStrict = true,
      defaultLimit = DEFAULT_LIMIT,
    } = controller;
    if (!basePath || basePath === 'unknown_path') {
      throw getError({
        message: `[defineCrudController] Invalid controller basePath | name: ${name} | basePath: ${basePath}`,
      });
    }

    // 1. Resolve EntityClass
    let _entityClass: TClass<BaseEntity<EntitySchema>> | null = null;
    if (isClass(entity)) {
      _entityClass = entity;
    } else {
      _entityClass = entity();
    }
    const entityInstance = new _entityClass();

    // 2. Define required CRU (Create - Retrieve - Update) schema
    const idType = getIdType({ entity: entityInstance.schema });
    const selectSchema = entityInstance.getSchema({ type: SchemaTypes.SELECT });
    const createSchema = entityInstance.getSchema({ type: SchemaTypes.CREATE });
    const updateSchema = entityInstance.getSchema({ type: SchemaTypes.UPDATE });

    // 3. Define class
    return class extends BaseController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
      repository: AbstractRepository<EntitySchema>;
      defaultLimit: number;

      constructor(repository: AbstractRepository<EntitySchema>) {
        super({ scope: name, path: basePath, isStrict });
        this.repository = repository;
        this.defaultLimit = defaultLimit;
      }

      override binding(): ValueOrPromise<void> {
        // -----------------------------------------------------------------------------
        // Count
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.GET,
            path: RestPaths.COUNT,
            request: {
              query: z.object({ where: isStrict ? WhereSchema : z.optional(WhereSchema) }),
            },
            responses: jsonResponse({ schema: CountSchema }),
          },
          handler: async context => {
            const { where } = context.req.valid('query');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'count',
              description: 'execute count',
              args: { where },
              task: () => {
                return this.repository.count({ where });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Find
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.GET,
            path: RestPaths.ROOT,
            request: {
              query: z.object({ filter: FilterSchema }),
            },
            responses: jsonResponse({ schema: selectSchema }),
          },
          handler: async context => {
            const { filter = {} } = context.req.valid('query');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'find',
              description: 'execute find',
              args: filter,
              task: () => {
                return this.repository.find({ filter });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Find by ID
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.GET,
            path: '/:id',
            request: {
              params: idParamsSchema({ idType }),
              query: z.object({ filter: FilterSchema }),
            },
            responses: jsonResponse({ schema: selectSchema }),
          },
          handler: async context => {
            const { id } = context.req.valid('param');
            const { filter } = context.req.valid('query');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'find',
              description: 'execute findById',
              args: filter,
              task: () => {
                return this.repository.findById({ id, filter });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Find One
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.GET,
            path: RestPaths.FIND_ONE,
            request: {
              query: z.object({ filter: FilterSchema }),
            },
            responses: jsonResponse({ schema: selectSchema }),
          },
          handler: async context => {
            const { filter = {} } = context.req.valid('query');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'findOne',
              description: 'execute findOne',
              args: filter,
              task: () => {
                return this.repository.findOne({ filter });
              },
            });

            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Create
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.POST,
            path: RestPaths.ROOT,
            request: {
              body: jsonContent({
                description: 'CREATE | Request body',
                schema: createSchema,
              }),
            },
            responses: jsonResponse({
              schema: z.object({ count: CountSchema, data: selectSchema }),
            }),
          },
          handler: async context => {
            const data = context.req.valid('json');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'create',
              description: 'execute create',
              args: data,
              task: () => {
                return this.repository.create({ data });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Update by ID
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.PATCH,
            path: '/:id',
            request: {
              params: idParamsSchema({ idType }),
              body: jsonContent({
                description: 'UPDATE BY ID | Request body',
                schema: updateSchema,
              }),
            },
            responses: jsonResponse({
              schema: z.object({ count: CountSchema, data: selectSchema }),
            }),
          },
          handler: async context => {
            const { id } = context.req.valid('param');
            const data = context.req.valid('json');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'updateById',
              description: 'execute updateById',
              args: { id, data },
              task: () => {
                return this.repository.updateById({ id, data });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Update by
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.PATCH,
            path: RestPaths.ROOT,
            request: {
              query: z.object({ where: WhereSchema }),
              body: jsonContent({
                description: 'UPDATE BY CONDITION | Request body',
                schema: updateSchema,
              }),
            },
            responses: jsonResponse({
              schema: z.object({ count: CountSchema, data: z.array(selectSchema) }),
            }),
          },
          handler: async context => {
            const { where } = context.req.valid('query');
            const data = context.req.valid('json');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'updateBy',
              description: 'execute updateBy',
              args: { where, data },
              task: () => {
                return this.repository.updateBy({ where, data });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Delete by ID
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.DELETE,
            path: '/:id',
            request: {
              params: idParamsSchema({ idType }),
            },
            responses: jsonResponse({
              schema: z.object({ count: CountSchema, data: selectSchema }),
            }),
          },
          handler: async context => {
            const { id } = context.req.valid('param');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'deleteById',
              description: 'execute deleteById',
              args: { id },
              task: () => {
                return this.repository.deleteById({ id });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });

        // -----------------------------------------------------------------------------
        // Delete by
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: {
            method: HTTP.Methods.DELETE,
            path: RestPaths.ROOT,
            request: {
              query: z.object({ where: WhereSchema }),
            },
            responses: jsonResponse({
              schema: z.object({ count: CountSchema, data: z.array(selectSchema) }),
            }),
          },
          handler: async context => {
            const { where } = context.req.valid('query');

            const rs = await executeWithPerformanceMeasure({
              logger: this.logger,
              level: 'debug',
              scope: 'deleteBy',
              description: 'execute deleteBy',
              args: { where },
              task: () => {
                return this.repository.deleteBy({ where });
              },
            });
            return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
          },
        });
      }
    };
  }
}
