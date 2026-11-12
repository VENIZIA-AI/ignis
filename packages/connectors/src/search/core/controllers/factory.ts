import type { TRepositoryDataObject } from '@venizia/ignis-kernel';
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
import { SearchEngineParams } from './engine-params';
import { SearchRawAccess } from './raw-access';
import type { TSearchScopeResolver } from './scope';

/** The routes of a search controller: only a listed route exists. */
export interface ISearchRoutes {
  search?: true;
  multiSearch?: true;
}

/** Configuration options for creating a search controller via SearchControllerFactory.build. */
export interface ISearchControllerOptions<
  Repository extends TCrudRepositoryClass = TCrudRepositoryClass,
  Shape extends z.ZodRawShape = {},
> {
  /** The repository class; its name is the binding the container injects, and its `@repository({ model })` supplies the entity whose SELECT schema drives the `hits[].document` shape in the response. */
  repository: Repository;

  /** When true, /search and /search/ are different routes. @default true */
  isStrict?: boolean;

  /** Authentication config applied to both generated routes. */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization config applied to both generated routes. */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  /** The routes to generate. */
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
   * `engineParams` is refused on every controller unless `engineParams.allow` lists it.
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
   * Which engine parameters a caller may send in a request's `engineParams`. Unset or empty, a request that carries
   * `engineParams` is refused with 400, on a scoped and an unscoped controller alike: raw engine parameters can replace
   * the controller's own filter and name fields the model hides. A parameter that selects rows or fields, or orders
   * them (`filter_by`, `include_fields`, `query_by`, `facet_by`, `group_by`, `highlight_fields`, `sort_by`, a
   * `preset`, ...) can never be listed: the definition throws. Server code still passes `engineParams` on the
   * repository call.
   */
  engineParams?: { allow?: string[] };

  /**
   * `modes.raw.allow: true` serves `mode: 'raw'` and multi-search over HTTP. Left out, both answer 400: they hand the
   * engine their parameters as they are, so the model's default filter and its hidden fields do not apply to them, and
   * opting in exposes the whole collection to every caller the route admits. A scoped controller cannot opt in. Server
   * code keeps `search({ mode: 'raw' })` and `multiSearch()` on the repository.
   */
  modes?: { raw?: { allow?: boolean } };
}

/** Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions. */
export class SearchControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: SearchControllerFactory.name });
  }

  /** `SearchInputSchema` with `shape` added to each of its four modes (a discriminated union has no `extend` of its own). */
  private static extendSearchBody(opts: { shape: z.ZodRawShape }) {
    const { shape } = opts;
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

    return z.discriminatedUnion('mode', [
      keyword.extend(shape),
      semantic.extend(shape),
      hybrid.extend(shape),
      raw.extend(shape),
    ]);
  }

  static defineRouteConfigs(opts: {
    selectSchema: z.ZodType;
    authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** The keys `request.body.extend` adds to every `mode` of the search body; none leaves `SearchInputSchema` as it is. */
    bodyExtension?: z.ZodRawShape;
  }) {
    const { selectSchema, authenticate, authorize, bodyExtension } = opts;
    const searchBodySchema = bodyExtension
      ? SearchControllerFactory.extendSearchBody({ shape: bodyExtension })
      : SearchInputSchema;

    const searchResponseSchema = z.object({
      found: z.number(),
      isFoundExact: z
        .boolean()
        .openapi({ description: 'False when the engine reports `found` as an estimate.' }),
      hits: z.array(z.object({ document: selectSchema })),
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
  >(opts: ISearchControllerOptions<Repository, Shape>) {
    const { repository, authenticate, authorize, routes, scope, isStrict = true } = opts;

    const factoryScope = `SearchControllerFactory.build | repository: ${repository.name}`;
    const isRawAllowed = SearchRawAccess.resolve({
      scope: factoryScope,
      modes: opts.modes,
      isScoped: scope !== undefined,
    });
    const allowedEngineParams = SearchEngineParams.resolveAllowlist({
      scope: factoryScope,
      allow: opts.engineParams?.allow,
    });

    if (scope && routes.multiSearch) {
      throw getError({
        message: `[SearchControllerFactory.build] A scoped search controller cannot serve multi-search | repository: ${repository.name} | leave routes.multiSearch out`,
      });
    }

    const model = MetadataRegistry.getInstance().getRepositoryBinding({
      target: repository,
    })?.model;

    if (!model) {
      throw getError({
        message: `[SearchControllerFactory.build] Cannot resolve the entity | repository: ${repository.name} | declare it with @repository({ model })`,
      });
    }

    const entityClass: TClass<AbstractEntity> = isClass(model) ? model : model();
    const entityInstance = new entityClass();

    const selectSchema = entityInstance.getSchema<z.ZodType>({ type: SchemaTypes.SELECT });
    const routeDefinitions = SearchControllerFactory.defineRouteConfigs({
      selectSchema,
      authenticate,
      authorize,
      bodyExtension: opts.request?.body?.extend,
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
          allowedEngineParams,
          isRawAllowed,
        });
      }

      /** The routes of a generated controller come from `routes`; a subclass adds its own here. */
      override binding(): ValueOrPromise<void> {}

      /** Registers each listed route, after the subclass's `binding()`. */
      override bindDefaultRoutes(): ValueOrPromise<void> {
        if (routes.search) {
          this.defineRoute({
            configs: routeDefinitions.SEARCH,
            handler: async (context) => this.search({ context }),
          });
        }

        if (routes.multiSearch) {
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
