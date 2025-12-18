import { BaseEntity, getIdType, SchemaTypes, TTableSchemaWithId } from '@/base/models';
import { AbstractRepository, DEFAULT_LIMIT } from '@/base/repositories';
import { z } from '@hono/zod-openapi';
import {
  BaseHelper,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  TClass,
  TResolver,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { Env, Schema } from 'hono';
import { BaseController } from '../base';
import { defineControllerRouteConfigs } from './definition';
import { isClass } from '@venizia/ignis-inversion';

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
  schema?: {
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
    const routeDefinitions = defineControllerRouteConfigs({
      isStrict,
      idType: getIdType({ entity: entityInstance.schema }),
      schema: {
        select: entityInstance.getSchema({ type: SchemaTypes.SELECT }),
        create: entityInstance.getSchema({ type: SchemaTypes.CREATE }),
        update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }),
        overrided: opts.schema,
      },
    });

    // 3. Define class
    const _controller = class extends BaseController<
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions
    > {
      repository: AbstractRepository<EntitySchema>;
      defaultLimit: number;

      constructor(repository: AbstractRepository<EntitySchema>) {
        super({ scope: name, path: basePath, isStrict });
        this.repository = repository;

        this.defaultLimit = defaultLimit;
        this.definitions = routeDefinitions;
      }

      override binding(): ValueOrPromise<void> {
        // -----------------------------------------------------------------------------
        // Count
        // -----------------------------------------------------------------------------
        this.defineRoute({
          configs: routeDefinitions.COUNT,
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
          configs: routeDefinitions.FIND,
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
          configs: routeDefinitions.FIND_BY_ID,
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
          configs: routeDefinitions.FIND_ONE,
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
          configs: routeDefinitions.CREATE,
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
          configs: routeDefinitions.UPDATE_BY_ID,
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
          configs: routeDefinitions.UPDATE_BY,
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
          configs: routeDefinitions.DELETE_BY_ID,
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
          configs: routeDefinitions.DELETE_BY,
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

    // Set the class name dynamically
    Object.defineProperty(_controller, 'name', { value: name, configurable: true });
    return _controller;
  }
}
