import type {
  TAnyObjectSchema,
  TCustomizableRouteConfig,
  TInjectMap,
  TRepositoryDataObject,
  TRouteAuthenticateConfig,
  TToggle,
} from '@venizia/ignis-kernel';
import type { AbstractEntity } from '@venizia/ignis-kernel';
import {
  CrudControllerFactory,
  Injection,
  OpenApiResponses,
  SchemaTypes,
} from '@venizia/ignis-kernel';
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
import {
  MultiSearchInputSchema,
  SearchInputSchema,
  SearchModes,
} from '@/search/core/repositories/common';
import type { ReadableSearchRepository } from '../repositories/core/readable';
import { AbstractSearchController } from './abstract';
import { SearchModeAllowlist } from './modes';
import type { TSearchFriendlyMode } from './modes';
import { SearchControllerOptionsUtility } from './options';
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
  Inject extends TInjectMap = {},
  RouteEnv extends Env = Env,
> {
  /** The repository class; its name is the binding the container injects, and its `@repository({ model })` supplies the entity whose SELECT schema drives the `hits[].document` shape in the response. */
  repository: Repository;

  /** When true, /search and /search/ are different routes. @default true */
  isStrict?: boolean;

  /**
   * The classes the function sources below need, by name: `inject: { products: ProductRepository }`. The container resolves
   * them once, with the controller, so a class that is not registered fails the boot and not a request. Every function
   * source (`scope`, `query.fixed`, `query.default`, `query.normalize`, `response.transform`) receives the instances as
   * `injected`, typed from this map: `({ hits, injected }) => injected.products.find(...)`. Classes only. A subclass that
   * declares its own constructor must pass every argument on to `super`.
   */
  inject?: Inject;

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
  scope?: TSearchScopeResolver<RouteEnv, TSearchExtra<Shape>, Inject>;

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
    TSearchExtra<Shape>,
    Inject,
    RouteEnv
  >;

  /** Reshapes the hits of `POST /search` before they leave the route: `{ use: true, document, transform }`. */
  response?: TToggle<
    ISearchResponseTransform<
      TRepositoryDataObject<InstanceType<Repository>>,
      TOutDocument,
      Inject,
      RouteEnv
    >
  >;

  /**
   * `modes.raw: { use: true }` serves `mode: 'raw'` and multi-search over HTTP. Left out, both answer 400: they hand the
   * engine their parameters as they are, so the model's default filter and its hidden fields do not apply to them, and
   * opting in exposes the whole collection to every caller the route admits. A scoped controller cannot opt in. Server
   * code keeps `search({ mode: 'raw' })` and `multiSearch()` on the repository.
   *
   * `modes.allow` names the other modes `POST /search` takes: `{ allow: [SearchModes.KEYWORD] }` is keyword-only. Left out,
   * every one of them is served. The list builds the body schema, so a request with any other `mode` is a 400 from the
   * validator and the OpenAPI document lists only these (and `raw` when `modes.raw` is on). An empty list and a duplicate
   * refuse the build.
   */
  modes?: { allow?: ReadonlyArray<TSearchFriendlyMode>; raw?: TToggle };
}

/** Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions. */
export class SearchControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: SearchControllerFactory.name });
  }

  /**
   * The body schema of `POST /search`: the members of `SearchInputSchema` for the modes served (`allowedModes`, and `raw` only
   * when `isRawAllowed`), each with `shape` added when `request.body.extend` is set (a discriminated union has no `extend` of
   * its own), and with `engineParams` of the three friendly modes narrowed to the names of `query.allow.tuning`: a strict
   * object, so an unknown name is a 400 and the OpenAPI document lists the names a client may send.
   */
  private static buildSearchBody(opts: {
    allowedModes: ReadonlyArray<TSearchFriendlyMode>;
    isRawAllowed: boolean;
    shape?: z.ZodRawShape;
    tuning: string[];
    isQueryBySettable: boolean;
  }) {
    const { allowedModes, isRawAllowed, shape = {}, tuning, isQueryBySettable } = opts;
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
    const isExtended = Object.keys(shape).length > 0 || tuning.length > 0;

    // `extend` drops the `.describe()` of a member, and the OpenAPI document shows it as the name of the mode.
    const friendly = {
      [SearchModes.KEYWORD]: isExtended
        ? keyword.extend({ ...shape, ...engineParams }).describe(keyword.description ?? '')
        : keyword,
      [SearchModes.SEMANTIC]: isExtended
        ? semantic.extend({ ...shape, ...engineParams }).describe(semantic.description ?? '')
        : semantic,
      [SearchModes.HYBRID]:
        isExtended || isQueryBySettable
          ? hybrid
              .extend({
                ...shape,
                ...engineParams,
                // The server may choose the fields (`query.fixed` or `query.default`), so the client need not.
                ...(isQueryBySettable ? { queryBy: z.array(z.string()).optional() } : {}),
              })
              .describe(hybrid.description ?? '')
          : hybrid,
    };
    const members = [
      ...allowedModes.map((mode) => friendly[mode]),
      ...(isRawAllowed
        ? [Object.keys(shape).length > 0 ? raw.extend(shape).describe(raw.description ?? '') : raw]
        : []),
    ];

    return z.discriminatedUnion('mode', members as [(typeof members)[number], ...typeof members]);
  }

  static defineRouteConfigs(opts: {
    selectSchema: z.ZodType;
    authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** The friendly modes the body takes (`modes.allow`); every one when left out. */
    allowedModes?: ReadonlyArray<TSearchFriendlyMode>;
    /** `modes.raw` is on: the body takes `mode: 'raw'` too. Left out, `raw` is not in the schema or the OpenAPI document. */
    isRawAllowed?: boolean;
    /** The keys `request.body.extend` adds to every `mode` of the search body. */
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
    const searchBodySchema = SearchControllerFactory.buildSearchBody({
      allowedModes: opts.allowedModes ?? SearchModeAllowlist.DEFAULTS,
      isRawAllowed: opts.isRawAllowed ?? false,
      shape: bodyExtension,
      tuning: allowedTuning,
      isQueryBySettable,
    });

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
        description: 'Single-collection search, one body per mode',
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
    Inject extends TInjectMap = {},
  >(opts: ISearchControllerOptions<Repository, Shape, TOutDocument, Inject, RouteEnv>) {
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
    const resolved = SearchControllerOptionsUtility.resolve<RouteEnv, TSearchExtra<Shape>, Inject>({
      scope: factoryScope,
      entityClass,
      options: {
        authenticate: opts.authenticate,
        authorize: opts.authorize,
        routes: opts.routes,
        modes: opts.modes,
        query: opts.query,
        response: opts.response,
        inject: opts.inject,
        hasScope: scope !== undefined,
      },
    });

    const entityInstance = new entityClass();
    const selectSchema = entityInstance.getSchema<z.ZodType>({ type: SchemaTypes.SELECT });
    const routeDefinitions = SearchControllerFactory.defineRouteConfigs({
      selectSchema,
      authenticate: resolved.authenticate,
      authorize: resolved.authorize,
      allowedModes: resolved.allowedModes,
      isRawAllowed: resolved.isRawAllowed,
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
      TSearchExtra<Shape>,
      Inject
    > {
      constructor(
        repositoryInstance: ReadableSearchRepository<TDataObject>,
        ...instances: unknown[]
      ) {
        super({
          scope: new.target.name,
          isStrict,
          repository: repositoryInstance,
          definitions: routeDefinitions,
          searchScope: scope,
          allowedEngineParams: resolved.allowedEngineParams,
          isRawAllowed: resolved.isRawAllowed,
          isBodyExtended: opts.request?.body !== undefined,
          querySettings: resolved.query,
          responseTransform: resolved.response,
          injected: Injection.collect({
            scope: new.target.name,
            inject: opts.inject,
            instances,
          }),
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
    Injection.register({ target: controllerClass, inject: opts.inject ?? {}, offset: 1 });

    return controllerClass;
  }
}
