import type {
  TAnyObjectSchema,
  TCustomizableRouteConfig,
  TRepositoryDataObject,
  TRouteAuthenticateConfig,
  TToggle,
} from '@venizia/ignis-kernel';
import type { AbstractEntity } from '@venizia/ignis-kernel';
import { CrudControllerFactory, OpenApiResponses, SchemaTypes } from '@venizia/ignis-kernel';
import { MetadataRegistry } from '@venizia/ignis-kernel/metadata';
import type { TAuthMode, TAuthStrategy } from '@venizia/ignis-kernel';
import type { IAuthorizationSpec } from '@venizia/ignis-kernel';
import type { TCrudRepositoryClass } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { isClass } from '@venizia/ignis-inversion';
import type { Env, Schema } from 'hono';
import { MultiSearchInputSchema, SearchInputSchema } from '@/search/core/repositories/common';
import type { ReadableSearchRepository } from '../repositories/core/readable';
import { AbstractSearchController } from './abstract';
import { SearchControllerOptionsUtility } from './options';
import type { ISearchLooseResponse } from './response';
import type { ISearchResolvedQuery } from './settings';
import type { TSearchScopeResolver } from './scope';
import type {
  ISearchQueryOptions,
  ISearchResponseTransform,
  TRepositoryTuning,
  TSearchExtra,
} from './types';

/** What a search route takes beside `use`: the request headers its OpenAPI document shows, the same `request.headers` a CRUD route takes. */
export interface ISearchRouteOptions {
  request?: Pick<NonNullable<TCustomizableRouteConfig['request']>, 'headers'>;
}

/** The routes of a search controller: a route that is not `{ use: true }` does not exist. */
export interface ISearchRoutes {
  search?: TToggle<ISearchRouteOptions>;
  multiSearch?: TToggle<ISearchRouteOptions>;
}

/** Configuration options for creating a search controller via SearchControllerFactory.build. */
export interface ISearchControllerOptions<
  Repository extends TCrudRepositoryClass = TCrudRepositoryClass,
  Shape extends z.ZodRawShape = {},
  TOutDocument extends object = TRepositoryDataObject<InstanceType<Repository>>,
> {
  /** The repository class; its name is the binding the container injects, and its `@repository({ model })` supplies the entity whose SELECT schema drives the `hits[].document` shape in the response. */
  repository: Repository;

  /** When true, /search and /search/ are different routes. @default true */
  isStrict?: boolean;

  /**
   * Authentication of both generated routes. Required: `{ strategies: [Authentication.STRATEGY_JWT] }` admits
   * a JWT caller only, and opening the routes means writing `{ skip: true }`. A config with no strategy and no `skip`
   * is refused when the controller is built, so a route is never open by omission.
   */
  authenticate: TRouteAuthenticateConfig;

  /** Authorization config applied to both generated routes. `authenticate: { skip: true }` drops it, as it does for any route. */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  /** The routes to generate: `{ search: { use: true } }`. A route left out, or `{ use: false }`, is not served. */
  routes: ISearchRoutes;

  /**
   * A function of the request context returning the filter this caller may search within. It is
   * ANDed into `input.filter.where` on the server: the client's own `where` can narrow it, never
   * widen or remove it. Fails closed - a scope that is null, undefined or throws refuses the
   * request with 403. Return `ScopeFilters.UNRESTRICTED` to apply none for a trusted caller.
   *
   * `raw` mode hands the engine its own wire parameters, and a multi-search entry carries a raw
   * `filterBy`; neither can take a scope, so a scoped controller refuses `raw` (400) and must disable the
   * multi-search route (leave `routes.multiSearch` out), which `SearchControllerFactory.build` requires.
   * `engineParams` is refused on every controller unless `query.allow.tuning` lists it.
   */
  scope?: TSearchScopeResolver<Env, z.infer<z.ZodObject<Shape>>>;

  /**
   * Adds keys to the body of `POST /search`, on every `mode`: `request.body.extend` is a Zod shape, and each key is
   * validated with the rest of the body (a bad value is a 400) and shown in the OpenAPI document. The validated body,
   * typed from the shape, reaches `scope` as `input`, so a facet the engine does not know can still narrow the scope
   * (an `ids` list that must all match, say). The extra keys are not search fields: nothing else reads them.
   * A key the base body already has is refused when the controller is built.
   */
  request?: { body?: { extend: Shape } };

  /**
   * What the server decides for a query (`fixed` wins over the client, `default` fills in what the client left out) and
   * which tuning knobs a client may send (`allow.tuning`). Typed against the model's fields and the datasource's engine.
   * A field the model hides, or a `queryBy` field that is not text, is refused when the controller is built, or with 500
   * when a function source returns it. `fixed` and `default` cannot be combined with `modes.raw` or `routes.multiSearch`:
   * both hand the engine their own parameters.
   */
  query?: ISearchQueryOptions<
    TRepositoryDataObject<InstanceType<Repository>>,
    TRepositoryTuning<Repository>,
    TSearchExtra<Shape>
  >;

  /** Reshapes the hits of `POST /search` before they leave the route: `{ use: true, document, transform }`. */
  response?: TToggle<
    ISearchResponseTransform<TRepositoryDataObject<InstanceType<Repository>>, TOutDocument>
  >;

  /**
   * `modes.raw: { use: true }` serves `mode: 'raw'` and multi-search over HTTP. Left out, both answer 400: they hand the
   * engine their parameters as they are, so the model's default filter and its hidden fields do not apply to them, and
   * opting in exposes the whole collection to every caller the route admits. A scoped controller cannot opt in. Server
   * code keeps `search({ mode: 'raw' })` and `multiSearch()` on the repository.
   */
  modes?: { raw?: TToggle };
}

/** Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions. */
export class SearchControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: SearchControllerFactory.name });
  }

  /**
   * `SearchInputSchema` with `shape` added to each of its four modes (a discriminated union has no `extend` of its own), and
   * with `engineParams` of the three friendly modes narrowed to the names of `query.allow.tuning`: a strict object, so an
   * unknown name is a 400 and the OpenAPI document lists the names a client may send.
   */
  private static extendSearchBody(opts: {
    shape?: z.ZodRawShape;
    tuning: string[];
    isQueryBySettable: boolean;
  }) {
    const { shape = {}, tuning, isQueryBySettable } = opts;
    const [keyword, semantic, hybrid, raw] = SearchInputSchema.options;
    const taken = Object.keys(shape).filter(
      (key) =>
        key in keyword.shape || key in semantic.shape || key in hybrid.shape || key in raw.shape,
    );

    if (taken.length > 0) {
      throw getError({
        message: `[SearchControllerFactory.build] request.body.extend names keys the search body already has | keys: ${taken.join(', ')}`,
      });
    }

    const engineParams =
      tuning.length > 0
        ? {
            engineParams: z
              .strictObject(
                Object.fromEntries(tuning.map((name) => [name, z.unknown().optional()])),
              )
              .optional()
              .describe('Tuning knobs this route allows a client to set'),
          }
        : {};

    // `extend` drops the `.describe()` of a member, and the OpenAPI document shows it as the name of the mode.
    return z.discriminatedUnion('mode', [
      keyword.extend({ ...shape, ...engineParams }).describe(keyword.description ?? ''),
      semantic.extend({ ...shape, ...engineParams }).describe(semantic.description ?? ''),
      hybrid
        .extend({
          ...shape,
          ...engineParams,
          // The server may choose the fields (`query.fixed` or `query.default`), so the client need not.
          ...(isQueryBySettable ? { queryBy: z.array(z.string()).optional() } : {}),
        })
        .describe(hybrid.description ?? ''),
      raw.extend(shape).describe(raw.description ?? ''),
    ]);
  }

  static defineRouteConfigs(opts: {
    selectSchema: z.ZodType;
    authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** The keys `request.body.extend` adds to every `mode` of the search body; none leaves `SearchInputSchema` as it is. */
    bodyExtension?: z.ZodRawShape;
    /** The names of `query.allow.tuning`: what `engineParams` of the search body may carry. */
    allowedTuning?: string[];
    /** `query.fixed` or `query.default` is set: a hybrid body then takes its `queryBy` from the server when the client sends none. */
    isQueryBySettable?: boolean;
    /** The `request.headers` of `routes.search` and `routes.multiSearch`; none leaves the route config without headers. */
    requestHeaders?: { search?: TAnyObjectSchema; multiSearch?: TAnyObjectSchema };
    /** `response.document`: the documents of the response, in place of the model's schema. */
    responseDocument?: z.ZodType;
  }) {
    const { selectSchema, authenticate, authorize, bodyExtension, allowedTuning = [] } = opts;
    const isQueryBySettable = opts.isQueryBySettable ?? false;
    const searchBodySchema =
      bodyExtension || allowedTuning.length > 0 || isQueryBySettable
        ? SearchControllerFactory.extendSearchBody({
            shape: bodyExtension,
            tuning: allowedTuning,
            isQueryBySettable,
          })
        : SearchInputSchema;

    const searchResponseSchema = z.object({
      found: z.number(),
      isFoundExact: z
        .boolean()
        .openapi({ description: 'False when the engine reports `found` as an estimate.' }),
      hits: z.array(z.object({ document: opts.responseDocument ?? selectSchema })),
    });

    const multiSearchResponseSchema = z.record(z.string(), z.unknown());

    const resolvedAuthenticate = authenticate ?? {};

    return {
      SEARCH: {
        method: HTTP.Methods.POST,
        path: '/search',
        description: 'Single-collection search (keyword, semantic, hybrid, or raw passthrough)',
        authenticate: resolvedAuthenticate,
        authorize,
        request: {
          ...(opts.requestHeaders?.search ? { headers: opts.requestHeaders.search } : {}),
          body: OpenApiResponses.jsonContent({
            description: 'Search input, discriminated by mode',
            schema: searchBodySchema,
          }),
        },
        responses: OpenApiResponses.jsonResponse({
          description: 'Search results',
          schema: searchResponseSchema,
        }),
      },

      MULTI_SEARCH: {
        method: HTTP.Methods.POST,
        path: '/multi-search',
        description: 'Cross-collection search, forwarded verbatim to the search engine',
        authenticate: resolvedAuthenticate,
        authorize,
        request: {
          ...(opts.requestHeaders?.multiSearch ? { headers: opts.requestHeaders.multiSearch } : {}),
          body: OpenApiResponses.jsonContent({
            description: 'Multi-search input - one or more per-collection native search params',
            schema: MultiSearchInputSchema,
          }),
        },
        responses: OpenApiResponses.jsonResponse({
          description: 'Federated (or, when union is true, merged) search results',
          schema: multiSearchResponseSchema,
        }),
      },
    } as const;
  }

  /** Creates a search controller with the routes you list: `POST /search` via `repository.search()`, and `POST /multi-search` via `repository.dataSource.multiSearch()`. The path is the `@controller({ path })` of the subclass. */
  static build<
    Repository extends TCrudRepositoryClass,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
    TDataObject extends object = TRepositoryDataObject<InstanceType<Repository>>,
    Shape extends z.ZodRawShape = {},
    TOutDocument extends object = TDataObject,
  >(opts: ISearchControllerOptions<Repository, Shape, TOutDocument>) {
    const { repository, scope, isStrict = true } = opts;

    const factoryScope = `SearchControllerFactory.build | repository: ${repository.name}`;
    const model = MetadataRegistry.getInstance().getRepositoryBinding({
      target: repository,
    })?.model;

    if (!model) {
      throw getError({
        message: `[SearchControllerFactory.build] Cannot resolve the entity | repository: ${repository.name} | declare it with @repository({ model })`,
      });
    }

    const entityClass: TClass<AbstractEntity> = isClass(model) ? model : model();
    const resolved = SearchControllerOptionsUtility.resolve({
      scope: factoryScope,
      entityClass,
      options: {
        authenticate: opts.authenticate,
        authorize: opts.authorize,
        routes: opts.routes,
        modes: opts.modes,
        query: opts.query,
        response: opts.response,
        hasScope: scope !== undefined,
      },
    });

    const entityInstance = new entityClass();
    const selectSchema = entityInstance.getSchema<z.ZodType>({ type: SchemaTypes.SELECT });
    const routeDefinitions = SearchControllerFactory.defineRouteConfigs({
      selectSchema,
      authenticate: resolved.authenticate,
      authorize: resolved.authorize,
      bodyExtension: opts.request?.body?.extend,
      allowedTuning: opts.query?.allow?.tuning,
      isQueryBySettable:
        resolved.query?.fixed !== undefined || resolved.query?.default !== undefined,
      requestHeaders: resolved.requestHeaders,
      responseDocument: resolved.response?.document,
    });

    const controllerClass = class extends AbstractSearchController<
      AbstractEntity,
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions,
      TDataObject,
      z.infer<z.ZodObject<Shape>>
    > {
      constructor(repositoryInstance: ReadableSearchRepository<TDataObject>) {
        super({
          scope: new.target.name,
          isStrict,
          repository: repositoryInstance,
          definitions: routeDefinitions,
          searchScope: scope as
            | TSearchScopeResolver<RouteEnv, z.infer<z.ZodObject<Shape>>>
            | undefined,
          allowedEngineParams: resolved.allowedEngineParams,
          isRawAllowed: resolved.isRawAllowed,
          isBodyExtended: opts.request?.body !== undefined,
          // Same boundary cast as `searchScope`: the options are typed over `Env`, the controller over its `RouteEnv`.
          querySettings: resolved.query as ISearchResolvedQuery<RouteEnv> | undefined,
          responseTransform: resolved.response as ISearchLooseResponse<RouteEnv> | undefined,
        });
      }

      /** The routes of a generated controller come from `routes`; a subclass adds its own here. */
      override binding(): ValueOrPromise<void> {}

      /** Registers each route that is on, after the subclass's `binding()`. */
      override bindDefaultRoutes(): ValueOrPromise<void> {
        if (resolved.isSearchOn) {
          this.defineRoute({
            configs: routeDefinitions.SEARCH,
            handler: async (context) => this.search({ context }),
          });
        }

        if (resolved.isMultiSearchOn) {
          this.defineRoute({
            configs: routeDefinitions.MULTI_SEARCH,
            handler: async (context) => this.multiSearch({ context }),
          });
        }
      }
    };

    CrudControllerFactory.registerRepositoryInjection({
      target: controllerClass,
      factoryName: 'SearchControllerFactory.build',
      repositoryName: repository.name,
    });

    return controllerClass;
  }
}
