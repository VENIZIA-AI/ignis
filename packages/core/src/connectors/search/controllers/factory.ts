import type { TEntityDataObject } from '@/base/controllers';
import type { AbstractEntity } from '@/base/models';
import { SchemaTypes } from '@/base/models';
import type { TAuthMode, TAuthStrategy } from '@/components/auth/authenticate/common/constants';
import type { IAuthorizationSpec } from '@/components/auth/authorize/common/types';
import type { TAnyObjectSchema } from '@/utilities/schema.utility';
import type { TClass, TResolver, ValueOrPromise } from '@venizia/ignis-helpers';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { isClass } from '@venizia/ignis-inversion';
import type { Env, Schema } from 'hono';
import type { ReadableSearchRepository } from '../repositories/core/readable';
import { AbstractSearchController } from './abstract';
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
  /** Entity class or resolver function returning the entity class. Its SELECT schema drives the
   * `hits[].document` shape in the generated search route's response. */
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
}

/** Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions. */
export class SearchControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: SearchControllerFactory.name });
  }

  /** Creates a search controller with two generated endpoints:
   * 1. `POST {basePath}/search` (single-collection, via `repository.search()`)
   * 2. `POST {basePath}/multi-search` (cross-collection, via `repository.dataSource.multiSearch()`).
   */
  static defineSearchController<
    TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
    TDataObject extends object = TEntityDataObject<TEntity>,
  >(defOpts: ISearchControllerOptions<TEntity>) {
    const { controller, entity, authenticate, authorize, routes } = defOpts;

    const { name, basePath = 'unknown_path', isStrict = true } = controller;
    if (!basePath || basePath === 'unknown_path') {
      throw getError({
        message: `[defineSearchController] Invalid controller basePath | name: ${name} | basePath: ${basePath}`,
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
            handler: async context => this.search({ context }),
          });
        }

        if (isEnabled('multiSearch')) {
          this.defineRoute({
            configs: routeDefinitions.MULTI_SEARCH,
            handler: async context => this.multiSearch({ context }),
          });
        }
      }
    };

    Object.defineProperty(controllerClass, 'name', { value: name, configurable: true });
    return controllerClass;
  }
}
