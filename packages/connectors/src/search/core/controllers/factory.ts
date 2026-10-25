import type { TEntityDataObject } from '@venizia/ignis-kernel';
import type { AbstractEntity } from '@venizia/ignis-kernel';
import { registerFactoryRepositoryInjection, SchemaTypes } from '@venizia/ignis-kernel';
import type { TAuthMode, TAuthStrategy } from '@venizia/ignis-kernel';
import type { IAuthorizationSpec } from '@venizia/ignis-kernel';
import type { TAnyObjectSchema } from '@venizia/ignis-kernel';
import type { TClass, TResolver, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { isClass } from '@venizia/ignis-inversion';
import type { Env, Schema } from 'hono';
import type { ReadableSearchRepository } from '../repositories/core/readable';
import { AbstractSearchController } from './abstract';
import type { TSearchScopeResolver } from './scope';
import { defineSearchRouteConfigs } from './definition';

/** Per-route enable/disable switches for the generated search controller. */
export interface ISearchCustomizableRoutes {
  search?: { enabled?: boolean };
  multiSearch?: { enabled?: boolean };
}

/** Configuration options for creating a search controller via SearchControllerFactory.defineSearchController. */
export interface ISearchControllerOptions<
  TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
> {
  /** Entity class or resolver returning it; its SELECT schema drives the `hits[].document` shape in the generated route's response. */
  entity: TClass<TEntity> | TResolver<TClass<TEntity>>;

  repository: {
    name: string; // Repository binding name in the IoC container
  };

  controller: {
    name: string;
    basePath: string;
    isStrict?: boolean;
  };

  /** Authentication config applied to both generated routes. */
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };

  /** Authorization config applied to both generated routes. */
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  /** Per-route enable/disable configuration. */
  routes?: ISearchCustomizableRoutes;

  /**
   * A function of the request context returning the filter this caller may search within. It is
   * ANDed into `input.filter.where` on the server: the client's own `where` can narrow it, never
   * widen or remove it. Fails closed - a scope that is null, undefined or throws refuses the
   * request with 403. Return `ScopeFilters.UNRESTRICTED` to apply none for a trusted caller.
   *
   * `raw` mode and `engineParams` hand the engine its own wire parameters, and a multi-search entry
   * carries a raw `filterBy`; none can take a scope, so a scoped controller refuses `raw` and
   * `engineParams` (400) and must disable the multi-search route (`routes.multiSearch.enabled:
   * false`), which `defineSearchController` requires.
   */
  scope?: TSearchScopeResolver;
}

/** Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions. */
export class SearchControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: SearchControllerFactory.name });
  }

  /** Creates a search controller with two endpoints: `POST {basePath}/search` via `repository.search()`, and `POST {basePath}/multi-search` via `repository.dataSource.multiSearch()`. */
  static defineSearchController<
    TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
    TDataObject extends object = TEntityDataObject<TEntity>,
  >(defOpts: ISearchControllerOptions<TEntity>) {
    const { controller, entity, authenticate, authorize, routes, scope } = defOpts;

    const { name, basePath = 'unknown_path', isStrict = true } = controller;
    if (!basePath || basePath === 'unknown_path') {
      throw getError({
        message: `[defineSearchController] Invalid controller basePath | name: ${name} | basePath: ${basePath}`,
      });
    }

    if (scope && routes?.multiSearch?.enabled !== false) {
      throw getError({
        message: `[defineSearchController] A scoped search controller cannot serve multi-search | name: ${name} | set routes.multiSearch.enabled to false`,
      });
    }

    const entityClass = isClass(entity) ? entity : entity();
    const entityInstance = new entityClass();

    const selectSchema = entityInstance.getSchema({ type: SchemaTypes.SELECT });
    const routeDefinitions = defineSearchRouteConfigs({ selectSchema, authenticate, authorize });

    const controllerClass = class extends AbstractSearchController<
      TEntity,
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions,
      TDataObject
    > {
      constructor(repository: ReadableSearchRepository<TDataObject>) {
        super({
          scope: name,
          path: basePath,
          isStrict,
          repository,
          definitions: routeDefinitions,
          searchScope: scope as TSearchScopeResolver<RouteEnv> | undefined,
        });
      }

      /** Registers the search + multiSearch route handlers, honoring per-route enable flags. */
      override binding(): ValueOrPromise<void> {
        const isEnabled = (routeKey: keyof ISearchCustomizableRoutes) => {
          return routes?.[routeKey]?.enabled !== false;
        };

        if (isEnabled('search')) {
          this.defineRoute({
            configs: routeDefinitions.SEARCH,
            handler: async (context) => this.search({ context }),
          });
        }

        if (isEnabled('multiSearch')) {
          this.defineRoute({
            configs: routeDefinitions.MULTI_SEARCH,
            handler: async (context) => this.multiSearch({ context }),
          });
        }
      }
    };

    Object.defineProperty(controllerClass, 'name', { value: name, configurable: true });
    registerFactoryRepositoryInjection({
      target: controllerClass,
      factoryName: 'defineSearchController',
      controllerName: name,
      repositoryName: defOpts.repository.name,
    });
    return controllerClass;
  }
}
