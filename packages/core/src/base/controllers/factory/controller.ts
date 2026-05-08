import { BaseEntity } from '@/base/models/base';
import { SchemaTypes } from '@/base/models/common/constants';
import { getIdType, TTableObject, TTableSchemaWithId } from '@/base/models/common/types';
import { AbstractRepository } from '@/base/repositories/core/abstract';
import { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common/constants';
import { IAuthorizationSpec } from '@/components/auth/authorize/common/types';
import { z } from '@hono/zod-openapi';
import {
  AnyType,
  BaseHelper,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  TClass,
  TNullable,
  toBoolean,
  TResolver,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { isClass } from '@venizia/ignis-inversion';
import { Env, Schema } from 'hono';
import { ICustomizableRoutes, TRouteContext } from '../common';
import { BaseRestController } from '../rest/base';
import { defineControllerRouteConfigs } from './definition';

/** Configuration options for creating a CRUD controller via ControllerFactory.defineCrudController. */
export interface ICrudControllerOptions<
  EntitySchema extends TTableSchemaWithId,
  Routes extends ICustomizableRoutes = ICustomizableRoutes,
> {
  /** Entity class or resolver function returning the entity class */
  entity: TClass<BaseEntity<EntitySchema>> | TResolver<TClass<BaseEntity<EntitySchema>>>;

  /** Repository binding configuration */
  repository: {
    name: string; // Repository binding name in the IoC container
  };

  controller: {
    name: string;
    basePath: string;
    readonly?: boolean;
    isStrict?: {
      path?: boolean;
      requestSchema?: boolean;
    };
  };

  /** Authentication config applied to all routes (unless overridden per-route). */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization config applied to all routes (unless overridden per-route). */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  /** Per-route configuration combining schema and auth overrides. */
  routes?: Routes;
}

/** Factory for generating typed CRUD controllers from entity definitions. */
export class ControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: ControllerFactory.name });
  }

  /** Creates a CRUD controller class with standard endpoints (count, find, findById, create, update, delete). */
  static defineCrudController<
    EntitySchema extends TTableSchemaWithId,
    Routes extends ICustomizableRoutes = ICustomizableRoutes,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
  >(defOpts: ICrudControllerOptions<EntitySchema, Routes>) {
    const { controller, entity, authenticate, authorize, routes } = defOpts;

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
    const _entityClass = isClass(entity) ? entity : entity();
    const entityInstance = new _entityClass();

    // 2. Define required CRU (Create - Retrieve - Update) schema
    const entitySchema = {
      select: entityInstance.getSchema({ type: SchemaTypes.SELECT }),
      create: entityInstance.getSchema({ type: SchemaTypes.CREATE }),
      update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }),
    };
    const routeDefinitions = defineControllerRouteConfigs({
      isStrict: isStrict.requestSchema ?? true,
      idType: getIdType({ entity: entityInstance.schema }),
      authenticate,
      authorize,
      routes,
      schema: entitySchema,
    });

    // Pre-computed request types using z.infer for explicit typing
    type TCountQuery = z.infer<typeof routeDefinitions.COUNT.request.query>;
    type TFindQuery = z.infer<typeof routeDefinitions.FIND.request.query>;
    type TFindByIdQuery = z.infer<typeof routeDefinitions.FIND_BY_ID.request.query>;
    type TFindByIdParams = z.infer<typeof routeDefinitions.FIND_BY_ID.request.params>;
    type TFindOneQuery = z.infer<typeof routeDefinitions.FIND_ONE.request.query>;
    type TCreateBody = z.infer<
      (typeof routeDefinitions.CREATE.request.body.content)['application/json']['schema']
    >;
    type TUpdateByIdParams = z.infer<typeof routeDefinitions.UPDATE_BY_ID.request.params>;
    type TUpdateByIdBody = z.infer<
      (typeof routeDefinitions.UPDATE_BY_ID.request.body.content)['application/json']['schema']
    >;
    type TUpdateByQuery = z.infer<typeof routeDefinitions.UPDATE_BY.request.query>;
    type TUpdateByBody = z.infer<
      (typeof routeDefinitions.UPDATE_BY.request.body.content)['application/json']['schema']
    >;
    type TDeleteByIdParams = z.infer<typeof routeDefinitions.DELETE_BY_ID.request.params>;
    type TDeleteByQuery = z.infer<typeof routeDefinitions.DELETE_BY.request.query>;

    // 3. Define class
    const _controller = class extends BaseRestController<
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions,
      typeof routeDefinitions
    > {
      repository: AbstractRepository<EntitySchema>;

      constructor(repository: AbstractRepository<EntitySchema>) {
        super({ scope: name, path: basePath, isStrict: isStrict.path ?? true });
        this.repository = repository;

        this.definitions = routeDefinitions;
      }

      /** Normalizes response based on x-request-count header (returns full or data-only). */
      normalizeCountData<
        ResponseSchema extends AnyType,
        RequestContext extends TRouteContext<RouteEnv> = TRouteContext<RouteEnv>,
        ResponseData extends {
          count: number;
          data?: TNullable<ResponseSchema>;
        } = { count: number; data?: TNullable<ResponseSchema> },
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

      /** GET /count */
      async count(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { where } = context.req.valid<TCountQuery>('query');

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
      }

      /** GET / - Returns paginated list with Content-Range header. */
      async find(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { filter = {} } = context.req.valid<TFindQuery>('query');

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

            [
              {
                key: HTTP.Headers.CONTENT_RANGE,
                value: data.length > 0 ? `records ${start}-${end}/${total}` : `records */${total}`,
              },
              { key: HTTP.Headers.RESPONSE_FORMAT, value: 'array' },
            ].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<Array<TTableObject<EntitySchema>>>({
              context,
              responseData: { count: data.length, data },
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** GET /:id */
      async findById(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { id } = context.req.valid<TFindByIdParams>('param');
        const { filter } = context.req.valid<TFindByIdQuery>('query');

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'findById',
          description: 'execute findById',
          args: filter,
          task: async () => {
            const _rs = await this.repository.findById({ id, filter });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TTableObject<EntitySchema>>({
              context,
              responseData: { count: _rs ? 1 : 0, data: _rs },
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** GET /find-one */
      async findOne(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { filter = {} } = context.req.valid<TFindOneQuery>('query');

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'findOne',
          description: 'execute findOne',
          args: filter,
          task: async () => {
            const _rs = await this.repository.findOne({ filter });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TTableObject<EntitySchema>>({
              context,
              responseData: { count: _rs ? 1 : 0, data: _rs },
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** POST / */
      async create(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const data = context.req.valid<TCreateBody>('json');

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'create',
          description: 'execute create',
          args: data,
          task: async () => {
            const _rs = await this.repository.create({ data });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TTableObject<EntitySchema>>({
              context,
              responseData: _rs,
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Created);
      }

      /** PATCH /:id */
      async updateById(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { id } = context.req.valid<TUpdateByIdParams>('param');
        const data = context.req.valid<TUpdateByIdBody>('json');

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'updateById',
          description: 'execute updateById',
          args: { id, data },
          task: async () => {
            const _rs = await this.repository.updateById({ id, data });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TTableObject<EntitySchema>>({
              context,
              responseData: _rs,
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** PATCH / */
      async updateBy(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { where } = context.req.valid<TUpdateByQuery>('query');

        if (!where || Object.keys(where).length === 0) {
          return context.json(
            { message: 'where filter is required for bulk operations' },
            HTTP.ResultCodes.RS_4.BadRequest,
          );
        }

        const data = context.req.valid<TUpdateByBody>('json');

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'updateBy',
          description: 'execute updateBy',
          args: { where, data },
          task: async () => {
            const _rs = await this.repository.updateBy({ where, data });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'array' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<Array<TTableObject<EntitySchema>>>({
              context,
              responseData: _rs,
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** DELETE /:id */
      async deleteById(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { id } = context.req.valid<TDeleteByIdParams>('param');

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'deleteById',
          description: 'execute deleteById',
          args: { id },
          task: async () => {
            const _rs = await this.repository.deleteById({ id });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TTableObject<EntitySchema>>({
              context,
              responseData: _rs,
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** DELETE / */
      async deleteBy(opts: { context: TRouteContext<RouteEnv> }) {
        const { context } = opts;
        const { where } = context.req.valid<TDeleteByQuery>('query');

        if (!where || Object.keys(where).length === 0) {
          return context.json(
            { message: 'where filter is required for bulk operations' },
            HTTP.ResultCodes.RS_4.BadRequest,
          );
        }

        const rs = await executeWithPerformanceMeasure({
          logger: this.logger,
          level: 'debug',
          scope: 'deleteBy',
          description: 'execute deleteBy',
          args: { where },
          task: async () => {
            const _rs = await this.repository.deleteBy({ where });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'array' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<Array<TTableObject<EntitySchema>>>({
              context,
              responseData: _rs,
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** Registers all CRUD route handlers. */
      override binding(): ValueOrPromise<void> {
        // Read routes — always registered
        this.defineRoute({
          configs: routeDefinitions.COUNT,
          handler: async context => this.count({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.FIND,
          handler: async context => this.find({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.FIND_ONE,
          handler: async context => this.findOne({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.FIND_BY_ID,
          handler: async context => this.findById({ context }),
        });

        // Write routes — skipped when readonly
        if (controller.readonly) {
          return;
        }

        this.defineRoute({
          configs: routeDefinitions.CREATE,
          handler: async context => this.create({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.UPDATE_BY_ID,
          handler: async context => this.updateById({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.UPDATE_BY,
          handler: async context => this.updateBy({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.DELETE_BY_ID,
          handler: async context => this.deleteById({ context }),
        });

        this.defineRoute({
          configs: routeDefinitions.DELETE_BY,
          handler: async context => this.deleteBy({ context }),
        });
      }
    };

    // Set the class name dynamically
    Object.defineProperty(_controller, 'name', { value: name, configurable: true });
    return _controller;
  }
}
