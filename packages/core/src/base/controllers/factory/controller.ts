import { AbstractEntity } from '@/base/models';
import { SchemaTypes } from '@/base/models/common/constants';
import { AbstractRepository } from '@/base/repositories';
import { TAnyObjectSchema } from '@/utilities/schema.utility';
import { z } from '@hono/zod-openapi';
import {
  AnyType,
  BaseHelper,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  TNullable,
  toBoolean,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import { isClass } from '@venizia/ignis-inversion';
import { Env, Schema } from 'hono';
import {
  ICrudControllerOptions,
  ICustomizableRoutes,
  TEntityDataObject,
  TEntityPersistObject,
  TRouteContext,
} from '../common';
import { BaseRestController } from '../rest/base';
import { defineControllerRouteConfigs } from './definition';

/** Factory for generating typed CRUD controllers from entity definitions. */
export class ControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: ControllerFactory.name });
  }

  /** Creates a CRUD controller with standard endpoints (count/find/findById/create/update/delete).
   * `TDataObject`/`TPersistObject` are inferred from `entity`'s schema (`$inferSelect`/`$inferInsert`),
   * so `this.repository` is fully typed with no explicit generics; they remain overridable as the
   * trailing generics for the rare engine-neutral entity that carries no typed schema. */
  static defineCrudController<
    TEntity extends AbstractEntity = AbstractEntity,
    Routes extends ICustomizableRoutes = ICustomizableRoutes,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
    TDataObject extends object = TEntityDataObject<TEntity>,
    TPersistObject extends object = TEntityPersistObject<TEntity>,
  >(defOpts: ICrudControllerOptions<Routes, TEntity>) {
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

    const _entityClass = isClass(entity) ? entity : entity();
    const entityInstance = new _entityClass();

    // `getSchema()` is typed `unknown` to stay engine-neutral (both drizzle-zod and the search
    // collection DSL return an object schema at runtime) - narrowed to TAnyObjectSchema here.
    // getSchema() is typed unknown to stay engine-neutral - narrowed once at this boundary.
    const entitySchema = {
      select: entityInstance.getSchema({ type: SchemaTypes.SELECT }) as TAnyObjectSchema,
      create: entityInstance.getSchema({ type: SchemaTypes.CREATE }) as TAnyObjectSchema,
      update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }) as TAnyObjectSchema,
    };
    // Each entity family resolves its own id shape via getIdType() (postgres: pgTable id column;
    // document families like BaseSearchEntity: always 'string').
    const idType = entityInstance.getIdType();

    const routeDefinitions = defineControllerRouteConfigs({
      isStrict: isStrict.requestSchema ?? true,
      idType,
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

    // `Definitions` (5th generic) is intentionally omitted: passing `typeof routeDefinitions` would
    // blow past TS's d.ts serialization cap (TS7056) for complex schemas; runtime value is unchanged.
    const _controller = class extends BaseRestController<
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions
    > {
      repository: AbstractRepository<TDataObject, TPersistObject>;

      constructor(repository: AbstractRepository<TDataObject, TPersistObject>) {
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

            return this.normalizeCountData<Array<TDataObject>>({
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

            return this.normalizeCountData<TDataObject>({
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

            return this.normalizeCountData<TDataObject>({
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
            // `data`'s static type comes from the runtime-computed request-body schema; `TPersistObject`
            // is a caller-supplied generic with no structural link to it, so this cast narrows the same way.
            const _rs = await this.repository.create({ data: data as TPersistObject });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TDataObject>({
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
            // Same request-body-schema-vs-TPersistObject boundary as create() above.
            const _rs = await this.repository.updateById({
              id,
              data: data as Partial<TPersistObject>,
            });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'object' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<TDataObject>({
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
            // Same request-body-schema-vs-TPersistObject boundary as create() above.
            const _rs = await this.repository.updateBy({
              where,
              data: data as Partial<TPersistObject>,
            });

            [{ key: HTTP.Headers.RESPONSE_FORMAT, value: 'array' }].forEach(el => {
              context.header(el.key, el.value);
            });

            return this.normalizeCountData<Array<TDataObject>>({
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

            return this.normalizeCountData<TDataObject>({
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

            return this.normalizeCountData<Array<TDataObject>>({
              context,
              responseData: _rs,
            });
          },
        });

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /** Registers all CRUD route handlers. */
      override binding(): ValueOrPromise<void> {
        const isEnabled = (routeKey: keyof ICustomizableRoutes) => {
          if (controller.enabledRoutes) {
            return controller.enabledRoutes.includes(routeKey);
          }
          return routes?.[routeKey]?.enabled !== false;
        };

        // Read routes — always registered (unless explicitly disabled)
        if (isEnabled('count')) {
          this.defineRoute({
            configs: routeDefinitions.COUNT,
            handler: async context => this.count({ context }),
          });
        }

        if (isEnabled('find')) {
          this.defineRoute({
            configs: routeDefinitions.FIND,
            handler: async context => this.find({ context }),
          });
        }

        if (isEnabled('findOne')) {
          this.defineRoute({
            configs: routeDefinitions.FIND_ONE,
            handler: async context => this.findOne({ context }),
          });
        }

        if (isEnabled('findById')) {
          this.defineRoute({
            configs: routeDefinitions.FIND_BY_ID,
            handler: async context => this.findById({ context }),
          });
        }

        // Write routes — skipped when readonly
        if (controller.readonly) {
          return;
        }

        if (isEnabled('create')) {
          this.defineRoute({
            configs: routeDefinitions.CREATE,
            handler: async context => this.create({ context }),
          });
        }

        if (isEnabled('updateById')) {
          this.defineRoute({
            configs: routeDefinitions.UPDATE_BY_ID,
            handler: async context => this.updateById({ context }),
          });
        }

        if (isEnabled('updateBy')) {
          this.defineRoute({
            configs: routeDefinitions.UPDATE_BY,
            handler: async context => this.updateBy({ context }),
          });
        }

        if (isEnabled('deleteById')) {
          this.defineRoute({
            configs: routeDefinitions.DELETE_BY_ID,
            handler: async context => this.deleteById({ context }),
          });
        }

        if (isEnabled('deleteBy')) {
          this.defineRoute({
            configs: routeDefinitions.DELETE_BY,
            handler: async context => this.deleteBy({ context }),
          });
        }
      }
    };

    Object.defineProperty(_controller, 'name', { value: name, configurable: true });
    return _controller;
  }
}
