import type { AbstractEntity } from '@/base/models';
import { SchemaTypes } from '@/base/models/common/constants';
import type { AbstractRepository } from '@/base/repositories';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, MetadataRegistry } from '@/helpers/inversion';
import type { AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { isClass } from '@venizia/ignis-inversion';
import type { Env, Schema } from 'hono';
import type {
  ICrudControllerOptions,
  ICustomizableRoutes,
  TEntityDataObject,
  TEntityPersistObject,
} from '../common';
import { PersistableCrudController } from './crud';
import { assertWriteVerbsDeclareAuthorize } from './authorize-guard';
import { RouteConfigResolver } from './definition';

/** Factory for generating typed CRUD controllers from entity definitions. */
export class ControllerFactory extends BaseHelper {
  constructor() {
    super({ scope: ControllerFactory.name });
  }

  /**
   * Injects `repositories.<repositoryName>` into constructor parameter 0 of a factory-generated
   * controller, so a subclass needs no constructor. Recorded as metadata rather than a parameter
   * decorator, which Bun drops in some configurations. A subclass that declares its own `@inject` at
   * index 0 wins, and a sibling subclass keeps the factory's key.
   */
  static registerRepositoryInjection(opts: {
    target: TClass<unknown>;
    factoryName: string;
    controllerName: string;
    repositoryName: string;
  }): void {
    const { target, factoryName, controllerName, repositoryName } = opts;

    if (!repositoryName) {
      throw getError({
        message: `[${factoryName}] Invalid repository name | controller: ${controllerName} | repository.name must name the repository binding`,
      });
    }

    MetadataRegistry.getInstance().setInjectMetadata({
      target,
      index: 0,
      metadata: {
        key: BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: repositoryName }),
        index: 0,
        isOptional: false,
      },
    });
  }

  static defineCrudController<
    TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>,
    Routes extends ICustomizableRoutes = ICustomizableRoutes,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
    TDataObject extends object = TEntityDataObject<TEntity>,
    TPersistObject extends object = TEntityPersistObject<TEntity>,
  >(defOpts: ICrudControllerOptions<TEntity, Routes>) {
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

    assertWriteVerbsDeclareAuthorize({
      controllerName: name,
      authorize,
      routes,
      readonly: controller.readonly,
      enabledRoutes: controller.enabledRoutes,
    });

    const entityClass = isClass(entity) ? entity : entity();
    const entityInstance = new entityClass();

    const routeDefinitions = RouteConfigResolver.defineControllerRouteConfigs({
      isStrict: isStrict.requestSchema ?? true,
      idType: entityInstance.getIdType(),
      authenticate,
      authorize,
      routes,
      schema: {
        select: entityInstance.getSchema({ type: SchemaTypes.SELECT }),
        create: entityInstance.getSchema({ type: SchemaTypes.CREATE }),
        update: entityInstance.getSchema({ type: SchemaTypes.UPDATE }),
      },
      serverStampedKeys: entityInstance.getServerStampedKeys(),
    });

    const controllerClass = class extends PersistableCrudController<
      TEntity,
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions,
      TDataObject,
      TPersistObject
    > {
      // Any extra options: a repository whose options narrow `IExtraOptions` (a typed transaction) must fit.
      constructor(repository: AbstractRepository<TDataObject, TPersistObject, AnyType>) {
        super({
          scope: name,
          path: basePath,
          isStrict: isStrict.path ?? true,
          repository,
          definitions: routeDefinitions,
        });
      }

      /** Registers each CRUD route whose handler tier supplies it, honoring enabledRoutes/readonly. */
      override binding(): ValueOrPromise<void> {
        const isEnabled = (routeKey: keyof ICustomizableRoutes) => {
          if (controller.enabledRoutes) {
            return controller.enabledRoutes.includes(routeKey);
          }
          return routes?.[routeKey]?.enabled !== false;
        };

        // Read routes - always registered (unless explicitly disabled)
        if (isEnabled('count')) {
          this.defineRoute({
            configs: routeDefinitions.COUNT,
            handler: async (context) => this.count({ context }),
          });
        }

        if (isEnabled('find')) {
          this.defineRoute({
            configs: routeDefinitions.FIND,
            handler: async (context) => this.find({ context }),
          });
        }

        if (isEnabled('findOne')) {
          this.defineRoute({
            configs: routeDefinitions.FIND_ONE,
            handler: async (context) => this.findOne({ context }),
          });
        }

        if (isEnabled('findById')) {
          this.defineRoute({
            configs: routeDefinitions.FIND_BY_ID,
            handler: async (context) => this.findById({ context }),
          });
        }

        // Write routes - skipped when readonly
        if (controller.readonly) {
          return;
        }

        if (isEnabled('create')) {
          this.defineRoute({
            configs: routeDefinitions.CREATE,
            handler: async (context) => this.create({ context }),
          });
        }

        if (isEnabled('updateById')) {
          this.defineRoute({
            configs: routeDefinitions.UPDATE_BY_ID,
            handler: async (context) => this.updateById({ context }),
          });
        }

        if (isEnabled('updateBy')) {
          this.defineRoute({
            configs: routeDefinitions.UPDATE_BY,
            handler: async (context) => this.updateBy({ context }),
          });
        }

        if (isEnabled('deleteById')) {
          this.defineRoute({
            configs: routeDefinitions.DELETE_BY_ID,
            handler: async (context) => this.deleteById({ context }),
          });
        }

        if (isEnabled('deleteBy')) {
          this.defineRoute({
            configs: routeDefinitions.DELETE_BY,
            handler: async (context) => this.deleteBy({ context }),
          });
        }
      }
    };

    Object.defineProperty(controllerClass, 'name', { value: name, configurable: true });
    ControllerFactory.registerRepositoryInjection({
      target: controllerClass,
      factoryName: 'defineCrudController',
      controllerName: name,
      repositoryName: defOpts.repository.name,
    });
    return controllerClass;
  }
}
