import { AuthorizationActions } from '@/base/auth/authorize/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { AbstractEntity } from '@/base/models';
import { SchemaTypes } from '@/base/models/common/constants';
import type { AbstractRepository } from '@/base/repositories';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
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
import { defineControllerRouteConfigs } from './definition';
import { registerFactoryRepositoryInjection } from './repository-injection';

/** Factory for generating typed CRUD controllers from entity definitions. */
export class ControllerFactory extends BaseHelper {
  /** The generated routes that change data: the ones that must never be answered by a `read` permission. */
  private static readonly WRITE_VERBS = [
    'create',
    'updateById',
    'updateBy',
    'deleteById',
    'deleteBy',
  ] as const;

  constructor() {
    super({ scope: ControllerFactory.name });
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

    ControllerFactory.assertWriteVerbsDeclareAuthorize({
      controllerName: name,
      authorize,
      routes,
      readonly: controller.readonly,
      enabledRoutes: controller.enabledRoutes,
    });

    const entityClass = isClass(entity) ? entity : entity();
    const entityInstance = new entityClass();

    const routeDefinitions = defineControllerRouteConfigs({
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
    registerFactoryRepositoryInjection({
      target: controllerClass,
      factoryName: 'defineCrudController',
      controllerName: name,
      repositoryName: defOpts.repository.name,
    });
    return controllerClass;
  }

  private static describeSpec(opts: { spec: IAuthorizationSpec }): string {
    const { spec } = opts;
    return `{ action: ${String(spec.action)}, resource: ${String(spec.resource)} }`;
  }

  /**
   * Refuses a CRUD controller whose enabled write verb would inherit a controller-level `authorize`
   * that is only a `read` permission: the verb would then answer to anyone who may read.
   *
   * A write verb is fine when it declares its own `authorize` (a spec, an array, or `{ skip: true }`),
   * skips authentication, is not enabled, or the controller is `readonly`. Only the literal action
   * `read` is detected; a custom action name is the application's own vocabulary. An array counts when
   * every spec in it is `read`, since the specs of one route must all pass.
   */
  static assertWriteVerbsDeclareAuthorize(opts: {
    controllerName: string;
    authorize: IAuthorizationSpec | IAuthorizationSpec[] | undefined;
    routes: ICustomizableRoutes | undefined;
    readonly: boolean | undefined;
    enabledRoutes: Array<keyof ICustomizableRoutes> | undefined;
  }): void {
    const { controllerName, authorize, routes, readonly, enabledRoutes } = opts;

    if (readonly || authorize == null) {
      return;
    }

    const specs = Array.isArray(authorize) ? authorize : [authorize];
    const isReadOnlyPermission =
      specs.length > 0 && specs.every((spec) => spec.action === AuthorizationActions.READ);

    if (!isReadOnlyPermission) {
      return;
    }

    const offending = ControllerFactory.WRITE_VERBS.filter((verb) => {
      const isEnabled = enabledRoutes
        ? enabledRoutes.includes(verb)
        : routes?.[verb]?.enabled !== false;
      if (!isEnabled) {
        return false;
      }

      const route = routes?.[verb];
      return route?.authenticate?.skip !== true && route?.authorize == null;
    });

    if (offending.length === 0) {
      return;
    }

    const inherited = specs.map((spec) => ControllerFactory.describeSpec({ spec })).join(', ');
    const verbs = offending.map((verb) => `${controllerName}.${verb}`).join(', ');
    const hasBulkVerb = offending.some((verb) => verb === 'updateBy' || verb === 'deleteBy');

    throw getError({
      message: [
        `[defineCrudController] Write routes would inherit a read-only authorize | controller: ${controllerName} | routes: ${verbs} | inherited: ${inherited}`,
        'Anyone allowed to read could then create, update or delete.',
        `Fix: declare routes.<verb>.authorize for each of them (a spec, an array or { skip: true }), or set controller.readonly, or leave them out of controller.enabledRoutes.`,
        ...(hasBulkVerb
          ? [
              'updateBy and deleteBy are bulk routes on the collection and are generated unless controller.enabledRoutes lists the routes you want, so dropping them there closes this too.',
            ]
          : []),
      ].join(' | '),
    });
  }
}
