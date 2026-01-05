import {
  BaseEntity,
  getIdType,
  SchemaTypes,
  TTableObject,
  TTableSchemaWithId,
} from '@/base/models';
import { AbstractRepository } from '@/base/repositories';
import {
  AnyType,
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
import { TRouteContext } from '../common';

/**
 * Configuration options for creating a CRUD controller via {@link ControllerFactory.defineCrudController}.
 *
 * @typeParam EntitySchema - The Drizzle table schema type with an ID column
 *
 * @example
 * ```typescript
 * const UserControllerClass = ControllerFactory.defineCrudController<UserSchema>({
 *   entity: UserEntity,
 *   repository: { name: 'UserRepository' },
 *   controller: {
 *     name: 'UserController',
 *     basePath: '/users'
 *   },
 *   authStrategies: ['jwt'],
 *   routes: {
 *     find: { skipAuth: true },
 *     findById: { skipAuth: true }
 *   }
 * });
 * ```
 */
export interface ICrudControllerOptions<EntitySchema extends TTableSchemaWithId> {
  /** Entity class or resolver function returning the entity class */
  entity: TClass<BaseEntity<EntitySchema>> | TResolver<TClass<BaseEntity<EntitySchema>>>;

  /** Repository binding configuration */
  repository: {
    name: string; // Repository binding name in the IoC container
  };

  controller: {
    /** Controller class name (used for logging and OpenAPI tags) */
    name: string;
    /** Base path for all routes (e.g., '/users') */
    basePath: string;
    /** If true, only read operations are available (no create/update/delete) */
    readonly?: boolean;
    /** Strictness configuration for path and request schema validation */
    isStrict?: {
      /** Strict path matching (default: true) */
      path?: boolean;
      /** Require request schemas (default: true) */
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

/**
 * Factory for generating CRUD controllers from entity definitions.
 *
 * Creates fully-typed controller classes with standard CRUD endpoints
 * (count, find, findById, findOne, create, updateById, updateBy, deleteById, deleteBy)
 * based on entity schemas.
 *
 * @example
 * ```typescript
 * // Define a CRUD controller for User entity
 * const UserControllerClass = ControllerFactory.defineCrudController<UserSchema>({
 *   entity: UserEntity,
 *   repository: { name: 'UserRepository' },
 *   controller: { name: 'UserController', basePath: '/users' },
 *   authStrategies: ['jwt'],
 *   routes: {
 *     find: { skipAuth: true },
 *     findById: { skipAuth: true }
 *   }
 * });
 *
 * // Instantiate with repository
 * const userController = new UserControllerClass(userRepository);
 * ```
 */
export class ControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: ControllerFactory.name });
  }

  /**
   * Creates a CRUD controller class for the given entity.
   *
   * The returned class extends {@link BaseController} and includes handlers for:
   * - `GET /count` - Count records matching filter
   * - `GET /` - Find all records with pagination
   * - `GET /:id` - Find record by ID
   * - `GET /find-one` - Find single record matching filter
   * - `POST /` - Create new record
   * - `PATCH /:id` - Update record by ID
   * - `PATCH /` - Update records matching filter
   * - `DELETE /:id` - Delete record by ID
   * - `DELETE /` - Delete records matching filter
   *
   * @typeParam EntitySchema - The Drizzle table schema type
   * @typeParam RouteEnv - Hono environment type
   * @typeParam RouteSchema - Combined route schema type
   * @typeParam BasePath - Base path type
   * @typeParam ConfigurableOptions - Controller configuration options type
   * @param opts - Controller configuration options
   * @returns A controller class constructor
   *
   * @example
   * ```typescript
   * const ProductController = ControllerFactory.defineCrudController({
   *   entity: ProductEntity,
   *   repository: { name: 'ProductRepository' },
   *   controller: { name: 'ProductController', basePath: '/products' }
   * });
   * ```
   */
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
      /** Repository instance for database operations */
      repository: AbstractRepository<EntitySchema>;

      /**
       * Creates a new CRUD controller instance.
       *
       * @param repository - Repository for entity database operations
       */
      constructor(repository: AbstractRepository<EntitySchema>) {
        super({ scope: name, path: basePath, isStrict: isStrict.path ?? true });
        this.repository = repository;

        this.definitions = routeDefinitions;
      }

      /**
       * Normalizes response data based on the `x-request-count` header.
       *
       * If the header is 'true' (default), returns full response with count.
       * If 'false', returns only the data portion.
       *
       * Also sets the `X-Response-Count-Data` header with the count.
       *
       * @typeParam ResponseSchema - The response data type
       * @typeParam RequestContext - Hono context type
       * @typeParam ResponseData - Full response shape with count and data
       * @param _opts - Context and response data
       * @returns Normalized response (full or data-only)
       */
      normalizeCountData<
        ResponseSchema extends AnyType,
        RequestContext extends Context = Context,
        ResponseData extends {
          count: number;
          data?: TNullable<ResponseSchema>;
        } = { count: number; data?: TNullable<ResponseSchema> },
      >(_opts: { context: RequestContext; responseData: ResponseData }) {
        const { context, responseData } = _opts;
        const requestCountData = context.req.header(HTTP.Headers.REQUEST_COUNT_DATA) ?? 'true';
        const useCountData = toBoolean(requestCountData);

        context.header(HTTP.Headers.RESPONSE_COUNT_DATA, responseData.count.toString());

        if (useCountData) {
          return responseData;
        }

        return responseData.data;
      }

      /**
       * Handles GET /count - Returns count of records matching the filter.
       *
       * @param opts - Request options containing the Hono context
       * @returns JSON response with count
       */
      async count(opts: { context: TRouteContext<typeof routeDefinitions.COUNT, RouteEnv> }) {
        const { context } = opts;
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
      }

      /**
       * Handles GET / - Returns paginated list of records with Content-Range header.
       *
       * Sets `Content-Range` header following HTTP RFC 7233 standard for pagination.
       *
       * @param opts - Request options containing the Hono context
       * @returns JSON response with data array and range information
       */
      async find(opts: { context: TRouteContext<typeof routeDefinitions.FIND, RouteEnv> }) {
        const { context } = opts;
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

      /**
       * Handles GET /:id - Returns single record by ID.
       *
       * @param opts - Request options containing the Hono context
       * @returns JSON response with the found record or null
       */
      async findById(opts: {
        context: TRouteContext<typeof routeDefinitions.FIND_BY_ID, RouteEnv>;
      }) {
        const { context } = opts;
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

      /**
       * Handles GET /find-one - Returns first record matching the filter.
       *
       * @param opts - Request options containing the Hono context
       * @returns JSON response with the found record or null
       */
      async findOne(opts: { context: TRouteContext<typeof routeDefinitions.FIND_ONE, RouteEnv> }) {
        const { context } = opts;
        const { filter = {} } = context.req.valid('query');

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

      /**
       * Handles POST / - Creates a new record.
       *
       * @param opts - Request options containing the Hono context with request body
       * @returns JSON response with created record and count
       */
      async create(opts: { context: TRouteContext<typeof routeDefinitions.CREATE, RouteEnv> }) {
        const { context } = opts;
        const data = context.req.valid('json');

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

        return context.json(rs, HTTP.ResultCodes.RS_2.Ok);
      }

      /**
       * Handles PATCH /:id - Updates a record by ID.
       *
       * @param opts - Request options containing the Hono context with ID param and body
       * @returns JSON response with updated record and count
       */
      async updateById(opts: {
        context: TRouteContext<typeof routeDefinitions.UPDATE_BY_ID, RouteEnv>;
      }) {
        const { context } = opts;
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

      /**
       * Handles PATCH / - Updates records matching the where filter.
       *
       * @param opts - Request options containing the Hono context with where query and body
       * @returns JSON response with updated records array and count
       */
      async updateBy(opts: {
        context: TRouteContext<typeof routeDefinitions.UPDATE_BY, RouteEnv>;
      }) {
        const { context } = opts;
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

      /**
       * Handles DELETE /:id - Deletes a record by ID.
       *
       * @param opts - Request options containing the Hono context with ID param
       * @returns JSON response with deleted record and count
       */
      async deleteById(opts: {
        context: TRouteContext<typeof routeDefinitions.DELETE_BY_ID, RouteEnv>;
      }) {
        const { context } = opts;
        const { id } = context.req.valid('param');

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

      /**
       * Handles DELETE / - Deletes records matching the where filter.
       *
       * @param opts - Request options containing the Hono context with where query
       * @returns JSON response with deleted records array and count
       */
      async deleteBy(opts: {
        context: TRouteContext<typeof routeDefinitions.DELETE_BY, RouteEnv>;
      }) {
        const { context } = opts;
        const { where } = context.req.valid('query');

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

      /**
       * Registers all CRUD route handlers.
       *
       * Called during controller configuration. Binds all standard CRUD
       * endpoints to their respective handler methods.
       */
      override binding(): ValueOrPromise<void> {
        // Read operations
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

        // Write operations
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

        // Delete operations
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
