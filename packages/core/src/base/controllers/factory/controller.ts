import {
  BaseEntity,
  getIdType,
  SchemaTypes,
  TTableObject,
  TTableSchemaWithId,
} from '@/base/models';
import { AbstractRepository } from '@/base/repositories';
import {
  BaseHelper,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  TAuthStrategy,
  TClass,
  TNullable,
  toBoolean,
  TResolver,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { isClass } from '@venizia/ignis-inversion';
import { Context, Env, Schema } from 'hono';
import { BaseController } from '../base';
import { defineControllerRouteConfigs, TRoutesConfig } from './definition';

export interface ICrudControllerOptions<EntitySchema extends TTableSchemaWithId> {
  entity: TClass<BaseEntity<EntitySchema>> | TResolver<TClass<BaseEntity<EntitySchema>>>;
  repository: { name: string };
  controller: {
    name: string;
    basePath: string;
    readonly?: boolean;
    isStrict?: {
      path?: boolean;
      requestSchema?: boolean;
    };
  };
  /**
   * Auth strategies applied to all routes (unless overridden per-route)
   *
   * @example
   * // Apply JWT auth to all routes
   * authStrategies: ['jwt']
   */
  authStrategies?: Array<TAuthStrategy>;
  /**
   * Per-route configuration combining schema and auth
   *
   * @example
   * // JWT auth on all, skip for public read endpoints
   * authStrategies: ['jwt'],
   * routes: {
   *   find: { skipAuth: true },
   *   findById: { skipAuth: true },
   *   count: { skipAuth: true },
   * }
   *
   * @example
   * // No controller auth, require JWT only for writes
   * routes: {
   *   create: { authStrategies: ['jwt'] },
   *   updateById: { authStrategies: ['jwt'], requestBody: CustomUpdateSchema },
   *   deleteById: { authStrategies: ['jwt'] },
   * }
   *
   * @example
   * // Custom response schema with auth
   * authStrategies: ['jwt'],
   * routes: {
   *   find: { schema: CustomFindResponseSchema, skipAuth: true },
   *   create: { schema: CustomCreateResponseSchema, requestBody: CustomCreateBodySchema },
   * }
   */
  routes?: TRoutesConfig;
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
    const { controller, entity, authStrategies, routes } = opts;

    const {
      name,
      basePath = 'unknown_path',
      isStrict = { path: true, requestSchema: true },
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
      isStrict: isStrict.requestSchema ?? true,
      idType: getIdType({ entity: entityInstance.schema }),
      authStrategies,
      routes,
      schema: {
        select: entityInstance.getSchema({ type: SchemaTypes.SELECT }),
        create: entityInstance.getSchema({ type: SchemaTypes.CREATE }),
        update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }),
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

      constructor(repository: AbstractRepository<EntitySchema>) {
        super({ scope: name, path: basePath, isStrict: isStrict.path ?? true });
        this.repository = repository;

        this.definitions = routeDefinitions;
      }

      normalizeCountData<
        RequestContext extends Context,
        ResponseData extends {
          count: number;
          data?: TNullable<TTableObject<EntitySchema> | Array<TTableObject<EntitySchema>>>;
        },
      >(opts: { context: RequestContext; responseData: ResponseData }) {
        const { context, responseData } = opts;
        const requestCountData = context.req.header(HTTP.Headers.REQUEST_COUNT_DATA) ?? 'true';
        const useCountData = toBoolean(requestCountData);

        context.header(HTTP.Headers.RESPONSE_COUNT_DATA, responseData.count.toString());

        if (useCountData) {
          return responseData;
        }

        return responseData.data;
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
              task: async () => {
                const _rs = await this.repository.find({
                  filter,
                  options: { shouldQueryRange: true },
                });

                const { data, range } = _rs;

                const { start, end, total } = range;
                context.header(
                  HTTP.Headers.CONTENT_RANGE,
                  data.length > 0 ? `records ${start}-${end}/${total}` : `records */${total}`,
                );
                context.header(
                  HTTP.Headers.RESPONSE_COUNT_DATA,
                  (data.length > 0 ? end - start + 1 : 0).toString(),
                );
                return data;
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
              task: async () => {
                const _rs = await this.repository.findById({ id, filter });
                context.header(HTTP.Headers.RESPONSE_COUNT_DATA, (_rs ? 1 : 0).toString());
                return _rs;
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
              task: async () => {
                const _rs = await this.repository.findOne({ filter });
                context.header(HTTP.Headers.RESPONSE_COUNT_DATA, (_rs ? 1 : 0).toString());
                return _rs;
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
              task: async () => {
                const _rs = await this.repository.create({ data });
                return this.normalizeCountData({ context, responseData: _rs });
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
              task: async () => {
                const _rs = await this.repository.updateById({ id, data });
                return this.normalizeCountData({ context, responseData: _rs });
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
              task: async () => {
                const _rs = await this.repository.updateBy({ where, data });
                return this.normalizeCountData({ context, responseData: _rs });
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
              task: async () => {
                const _rs = await this.repository.deleteById({ id });
                return this.normalizeCountData({ context, responseData: _rs });
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
              task: async () => {
                const _rs = await this.repository.deleteBy({ where });
                return this.normalizeCountData({ context, responseData: _rs });
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
