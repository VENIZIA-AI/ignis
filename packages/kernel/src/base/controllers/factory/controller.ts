import type { AnyType } from '@venizia/ignis-helpers/common';
import type { AbstractRepository } from '@/base/repositories';
import { AuthorizationActions } from '@/base/auth/authorize/common/constants';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import type { AbstractEntity } from '@/base/models';
import { AuditFields, SchemaTypes } from '@/base/models/common/constants';
import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, MetadataRegistry } from '@/helpers/inversion';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { isClass } from '@venizia/ignis-inversion';
import type { Env, Schema } from 'hono';
import type {
  ICrudControllerOptions,
  TCrudRepositoryClass,
  TCrudRoutes,
  TRepositoryDataObject,
  TRepositoryPersistObject,
} from '../common';
import { PersistableCrudController } from './crud';
import { RouteConfigResolver } from './definition';

/** Factory for generating typed CRUD controllers from entity definitions. */
export class ControllerFactory extends BaseHelper {
  /** The generated routes that change data: the ones that must never be answered by a `read` permission. */
  private static readonly WRITE_VERBS = [
    'create',
    'updateById',
    'updateBy',
    'deleteById',
    'deleteBy',
    'restoreById',
    'restoreBy',
  ] as const;

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
    repositoryName: string;
  }): void {
    const { target, factoryName, repositoryName } = opts;

    if (!repositoryName) {
      throw getError({
        message: `[${factoryName}] Invalid repository name | repository.name must name the repository binding`,
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

  static crud<
    Repository extends TCrudRepositoryClass,
    RouteEnv extends Env = Env,
    RouteSchema extends Schema = {},
    BasePath extends string = '/',
    ConfigurableOptions extends object = {},
    TDataObject extends object = TRepositoryDataObject<InstanceType<Repository>>,
    TPersistObject extends object = TRepositoryPersistObject<InstanceType<Repository>>,
  >(opts: ICrudControllerOptions<Repository>) {
    const { repository, authenticate, authorize, routes, isStrict = {} } = opts;

    ControllerFactory.assertWriteVerbsDeclareAuthorize({
      repositoryName: repository.name,
      authorize,
      routes,
    });
    ControllerFactory.assertRestoreRoutesSupported({ repository, routes });

    const model = MetadataRegistry.getInstance().getRepositoryBinding({
      target: repository,
    })?.model;

    if (!model) {
      throw getError({
        message: `[ControllerFactory.crud] Cannot resolve the entity | repository: ${repository.name} | declare it with @repository({ model })`,
      });
    }

    const entityClass = isClass(model) ? model : model();
    const entityInstance = new entityClass();
    const settings = MetadataRegistry.getInstance().getModelMetadata({
      target: entityClass,
    })?.settings;

    const routeDefinitions = RouteConfigResolver.defineControllerRouteConfigs({
      isStrict: isStrict.requestSchema ?? true,
      idType: entityInstance.getIdType(),
      authenticate,
      authorize,
      routes,
      schema: {
        select: entityInstance.getSchema<TAnyObjectSchema>({ type: SchemaTypes.SELECT }),
        create: entityInstance.getSchema<TAnyObjectSchema>({ type: SchemaTypes.CREATE }),
        update: entityInstance.getSchema<TAnyObjectSchema>({ type: SchemaTypes.UPDATE }),
      },
      serverStampedKeys: [...(settings?.properties?.stamped ?? AuditFields.SCHEME_SET)],
    });

    const controllerClass = class extends PersistableCrudController<
      AbstractEntity<TAnyObjectSchema>,
      RouteEnv,
      RouteSchema,
      BasePath,
      ConfigurableOptions,
      TDataObject,
      TPersistObject
    > {
      // Any extra options: a repository whose options narrow `IExtraOptions` (a typed transaction) must fit.
      constructor(repositoryInstance: AbstractRepository<TDataObject, TPersistObject, AnyType>) {
        super({
          scope: new.target.name,
          isStrict: isStrict.path ?? true,
          repository: repositoryInstance,
          definitions: routeDefinitions,
        });
      }

      /** The routes of a generated controller come from `routes`; a subclass adds its own here. */
      override binding(): ValueOrPromise<void> {}

      /** Registers each listed CRUD route, after `binding()`: a custom static path is never taken by `/{id}`. */
      override bindDefaultRoutes(): ValueOrPromise<void> {
        if (routeDefinitions.COUNT) {
          this.defineRoute({
            configs: routeDefinitions.COUNT,
            handler: async (context) => this.count({ context }),
          });
        }

        if (routeDefinitions.FIND) {
          this.defineRoute({
            configs: routeDefinitions.FIND,
            handler: async (context) => this.find({ context }),
          });
        }

        if (routeDefinitions.FIND_ONE) {
          this.defineRoute({
            configs: routeDefinitions.FIND_ONE,
            handler: async (context) => this.findOne({ context }),
          });
        }

        if (routeDefinitions.FIND_BY_ID) {
          this.defineRoute({
            configs: routeDefinitions.FIND_BY_ID,
            handler: async (context) => this.findById({ context }),
          });
        }

        if (routeDefinitions.CREATE) {
          this.defineRoute({
            configs: routeDefinitions.CREATE,
            handler: async (context) => this.create({ context }),
          });
        }

        if (routeDefinitions.UPDATE_BY_ID) {
          this.defineRoute({
            configs: routeDefinitions.UPDATE_BY_ID,
            handler: async (context) => this.updateById({ context }),
          });
        }

        if (routeDefinitions.UPDATE_BY) {
          this.defineRoute({
            configs: routeDefinitions.UPDATE_BY,
            handler: async (context) => this.updateBy({ context }),
          });
        }

        if (routeDefinitions.DELETE_BY_ID) {
          this.defineRoute({
            configs: routeDefinitions.DELETE_BY_ID,
            handler: async (context) => this.deleteById({ context }),
          });
        }

        if (routeDefinitions.DELETE_BY) {
          this.defineRoute({
            configs: routeDefinitions.DELETE_BY,
            handler: async (context) => this.deleteBy({ context }),
          });
        }

        if (routeDefinitions.RESTORE_BY) {
          this.defineRoute({
            configs: routeDefinitions.RESTORE_BY,
            handler: async (context) => this.restoreBy({ context }),
          });
        }

        if (routeDefinitions.RESTORE_BY_ID) {
          this.defineRoute({
            configs: routeDefinitions.RESTORE_BY_ID,
            handler: async (context) => this.restoreById({ context }),
          });
        }
      }
    };

    ControllerFactory.registerRepositoryInjection({
      target: controllerClass,
      factoryName: 'ControllerFactory.crud',
      repositoryName: repository.name,
    });

    return controllerClass;
  }

  /** A restore route needs a repository that has the restore methods; the types already refuse one, this is the backstop for an untyped caller. */
  private static assertRestoreRoutesSupported(opts: {
    repository: TCrudRepositoryClass;
    routes: TCrudRoutes | undefined;
  }): void {
    const { repository, routes } = opts;

    const isRestoreListed = routes?.restoreById !== undefined || routes?.restoreBy !== undefined;
    const isRestorable =
      typeof repository.prototype.restoreById === 'function' &&
      typeof repository.prototype.restoreBy === 'function';

    if (isRestoreListed && !isRestorable) {
      throw getError({
        message: `[ControllerFactory.crud] a restore route needs a repository with both restoreById and restoreBy | repository: ${repository.name}`,
      });
    }
  }

  private static describeSpec(opts: { spec: IAuthorizationSpec }): string {
    const { spec } = opts;

    return `{ action: ${String(spec.action)}, resource: ${String(spec.resource)} }`;
  }

  /**
   * Refuses a CRUD controller that lists a write verb which would inherit a controller-level `authorize`
   * that is only a `read` permission: the verb would then answer to anyone who may read.
   *
   * A listed write verb is fine when it declares its own `authorize` (a spec, an array, or `{ skip: true }`) or
   * skips authentication. Only the literal action `read` is detected; a custom action name is the application's own
   * vocabulary. An array counts when every spec in it is `read`, since the specs of one route must all pass.
   */
  static assertWriteVerbsDeclareAuthorize(opts: {
    repositoryName: string;
    authorize: IAuthorizationSpec | IAuthorizationSpec[] | undefined;
    routes: TCrudRoutes | undefined;
  }): void {
    const { repositoryName, authorize, routes } = opts;

    if (authorize == null) {
      return;
    }

    const specs = Array.isArray(authorize) ? authorize : [authorize];
    const isReadOnlyPermission =
      specs.length > 0 && specs.every((spec) => spec.action === AuthorizationActions.READ);

    if (!isReadOnlyPermission) {
      return;
    }

    const offending = ControllerFactory.WRITE_VERBS.filter((verb) => {
      const route = routes?.[verb];

      if (route === undefined) {
        return false;
      }

      return route === true || (route.authenticate?.skip !== true && route.authorize == null);
    });

    if (offending.length === 0) {
      return;
    }

    const inherited = specs.map((spec) => ControllerFactory.describeSpec({ spec })).join(', ');
    const verbs = offending.map((verb) => `${repositoryName}.${verb}`).join(', ');

    throw getError({
      message: [
        `[ControllerFactory.crud] Write routes would inherit a read-only authorize | repository: ${repositoryName} | routes: ${verbs} | inherited: ${inherited}`,
        'Anyone allowed to read could then create, update, delete or restore.',
        'Fix: declare routes.<verb>.authorize for each of them (a spec, an array or { skip: true }), or leave them out of routes.',
      ].join(' | '),
    });
  }
}
