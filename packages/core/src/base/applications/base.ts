import { ControllerTransports } from '@/base/controllers/common/constants';
import type { TBindingNamespace } from '@/common/bindings';
import { BindingNamespaces, CoreBindings } from '@/common/bindings';
import { RequestTrackerComponent } from '@/components';
import { GrpcComponent } from '@/components/controller/grpc';
import { RestComponent } from '@/components/controller/rest';
import type { Binding } from '@/helpers/inversion';
import {
  BindingKeys,
  BindingScopes,
  BindingValueTypes,
  MetadataRegistry,
} from '@/helpers/inversion';
import type { IBootableApplication, IBooter, IBootReport } from '@venizia/ignis-boot';
import {
  Bootstrapper,
  ControllerBooter,
  DatasourceBooter,
  RepositoryBooter,
  ServiceBooter,
} from '@venizia/ignis-boot';
import type {
  AnyObject,
  IConfigurable,
  ISecretHydrateEntry,
  ISecretRotatable,
  ISecretsHelper,
  ISecretsRegistration,
  TClass,
  ValueOrPromise,
} from '@venizia/ignis-helpers';
import {
  applicationEnvironment,
  createSecretsHelper,
  Environment,
  executeWithPerformanceMeasure,
  getError,
  HTTP,
  RuntimeModules,
  SecretProviders,
} from '@venizia/ignis-helpers';
import { contextStorage } from 'hono/context-storage';
import type { BaseComponent } from '../components';
import type { IDataSource } from '../datasources';
import { AppErrorMiddleware, emojiFavicon, notFoundHandler } from '../middlewares';
import type { TMixinOpts } from '../mixins';
import type { IRepository } from '../repositories';
import type { IService } from '../services';
import { AbstractApplication } from './abstract';
import type { IRestApplication } from './types';

const {
  NODE_ENV,
  RUN_MODE,
  ALLOW_EMPTY_ENV_VALUE = false,
  APPLICATION_ENV_PREFIX = 'APP_ENV',

  APP_ENV_APPLICATION_NAME = 'PNT',
  APP_ENV_APPLICATION_TIMEZONE = 'Asia/Ho_Chi_Minh',
  APP_ENV_DS_MIGRATION = 'postgres',
  APP_ENV_DS_AUTHORIZE = 'postgres',
  APP_ENV_LOGGER_FOLDER_PATH = './',
} = process.env;

interface IRegisterDynamicBindingsOptions<T extends IConfigurable = IConfigurable> {
  namespace: TBindingNamespace;

  onBeforeConfigure?: (opts: { binding: Binding<T> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<T>; instance: T }) => Promise<void>;
}

export abstract class BaseApplication
  extends AbstractApplication
  implements IRestApplication, IBootableApplication
{
  private registeredBindings: Record<string, Set<string>> = {};

  protected secretsProvider?: ISecretsHelper;
  protected secretsRegistration?: ISecretsRegistration;

  protected normalizePath(...segments: string[]): string {
    const joined = segments.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
    return joined || '/';
  }

  protected async registerDynamicBindings<T extends IConfigurable = IConfigurable>(
    opts: IRegisterDynamicBindingsOptions<T>,
  ): Promise<void> {
    const logger = this.logger.for(this.registerDynamicBindings.name);
    const { namespace, onBeforeConfigure, onAfterConfigure } = opts;

    if (!this.registeredBindings[namespace]) {
      this.registeredBindings[namespace] = new Set<string>();
    }
    const configured = this.registeredBindings[namespace];

    let bindings = this.findByTag({ tag: namespace, exclude: configured });
    while (bindings.length > 0) {
      const binding = bindings.shift();
      if (!binding) {
        logger.debug('Empty binding | namespace: %s', namespace);
        continue;
      }

      if (onBeforeConfigure) {
        await onBeforeConfigure({ binding });
      }

      const instance = this.get<T>({ key: binding.key, isOptional: false });
      if (!instance) {
        logger.debug('No binding instance | namespace: %s | key: %s', namespace, binding.key);
        configured.add(binding.key);
        continue;
      }

      await instance.configure();
      configured.add(binding.key);

      if (onAfterConfigure) {
        await onAfterConfigure({ binding, instance });
      }

      // Re-fetch excluding already configured - picks up dynamically added bindings
      bindings = this.findByTag({ tag: namespace, exclude: configured });
    }
  }

  component<Base extends BaseComponent, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? { namespace: BindingNamespaces.COMPONENT, key: ctor.name },
      ),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
  }

  async registerComponents(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerComponents.name,
      description: 'Register application components',
      task: async () => {
        await this.registerDynamicBindings({
          namespace: BindingNamespaces.COMPONENT,
          onAfterConfigure: async () => {
            // Register any datasources dynamically added by this component
            await this.registerDynamicBindings({ namespace: BindingNamespaces.DATASOURCE });
          },
        });
      },
    });
  }

  controller<Base, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.CONTROLLER,
          key: ctor.name,
        },
      ),
    }).toClass(ctor);
  }

  async registerControllers(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      description: 'Register application controllers',
      scope: this.registerControllers.name,
      task: async () => {
        const transports = this.configs.transports ?? [ControllerTransports.REST];

        for (const transport of transports) {
          switch (transport) {
            case ControllerTransports.REST: {
              const restComponent = new RestComponent(this);
              await restComponent.configure();
              break;
            }
            case ControllerTransports.GRPC: {
              const grpcComponent = new GrpcComponent(this);
              await grpcComponent.configure();
              break;
            }
            default: {
              throw getError({
                statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
                message: `[registerControllers] Unsupported transport: '${transport}'`,
              });
            }
          }
        }

        // Warn if gRPC controllers exist but gRPC transport is not enabled
        if (transports.includes(ControllerTransports.GRPC)) {
          return;
        }

        const allBindings = this.findByTag({ tag: BindingNamespaces.CONTROLLER });
        for (const binding of allBindings) {
          const target = binding.getBindingMeta({ type: BindingValueTypes.CLASS });
          if (!target) {
            continue;
          }

          const metadata = MetadataRegistry.getInstance().getControllerMetadata({ target });
          if (metadata?.transport !== ControllerTransports.GRPC) {
            continue;
          }

          this.logger
            .for(this.registerControllers.name)
            .error(
              'gRPC controller "%s" discovered but gRPC transport is not enabled. Add "%s" to transports config.',
              binding.key,
              ControllerTransports.GRPC,
            );
        }
      },
    });
  }

  service<Base extends IService, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.SERVICE,
          key: ctor.name,
        },
      ),
    }).toClass(ctor);
  }

  repository<Base extends IRepository, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.REPOSITORY,
          key: ctor.name,
        },
      ),
    }).toClass(ctor);
  }

  dataSource<Base extends IDataSource, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? {
          namespace: BindingNamespaces.DATASOURCE,
          key: ctor.name,
        },
      ),
    })
      .toClass(ctor)
      .setScope(BindingScopes.SINGLETON);
  }

  async registerDataSources(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDataSources.name,
      description: 'Register application data sources',
      task: async () => {
        await this.registerDynamicBindings({ namespace: BindingNamespaces.DATASOURCE });
      },
    });
  }

  registerSecrets(): ValueOrPromise<ISecretsRegistration> {
    return { provider: SecretProviders.SYSTEM_ENVS };
  }

  async hydrateSecrets(): Promise<void> {
    const logger = this.logger.for(this.hydrateSecrets.name);
    const registration = await this.registerSecrets();

    let provider: ISecretsHelper | undefined;
    const emptyHydrations: string[] = [];
    try {
      provider = await createSecretsHelper({ ...registration, identifier: 'app' });
      await provider.configure();

      for (const entry of registration.hydrate ?? []) {
        const bundle = await provider.getBundle({ path: entry.path });
        const merged = this.mergeSecretsIntoEnv({ bundle, entry });
        if (Object.keys(merged).length > 0) {
          continue;
        }

        if (this.hydrateEntryDeclaresExpectation({ entry })) {
          emptyHydrations.push(entry.path);
          continue;
        }

        logger.warn(
          'Hydrate entry resolved to an empty bundle and declares no expected keys | path: %s',
          entry.path,
        );
      }

      for (const entry of registration.lease ?? []) {
        await provider.lease({ path: entry.path, key: entry.key });
      }
    } catch (error) {
      const env = Environment.current;
      if (!Environment.DEVELOPMENT_ENVS.has(env.toLowerCase())) {
        throw getError({
          message: `[hydrateSecrets] Secret provider failed in non-development environment | env: ${env}`,
        });
      }
      logger.warn(
        'Secret provider failed; falling back to system-envs | env: %s | error: %s',
        env,
        error,
      );

      if (provider) {
        await provider
          .shutdown()
          .catch(shutdownError =>
            logger.error(
              'Failed to shut down partially-built provider during fallback | error: %s',
              shutdownError,
            ),
          );
      }
      provider = await createSecretsHelper({
        provider: SecretProviders.SYSTEM_ENVS,
        identifier: 'app',
      });
    }

    if (!provider) {
      throw getError({ message: '[hydrateSecrets] No secrets provider resolved' });
    }

    if (emptyHydrations.length > 0) {
      const env = Environment.current;
      if (!Environment.DEVELOPMENT_ENVS.has(env.toLowerCase())) {
        throw getError({
          message: `[hydrateSecrets] Hydrate entries resolved to an empty secret bundle in non-development environment | env: ${env} | paths: ${emptyHydrations.join(', ')}`,
        });
      }
      logger.warn(
        'Hydrate entries resolved to an empty secret bundle; continuing in development | env: %s | paths: %s',
        env,
        emptyHydrations.join(', '),
      );
    }

    this.bind<ISecretsHelper>({ key: CoreBindings.APPLICATION_CONFIG })
      .toProvider(() => provider)
      .setScope(BindingScopes.SINGLETON);

    this.registerPostStopHook({ identifier: 'secrets.shutdown', hook: () => provider.shutdown() });
    this.secretsProvider = provider;
    this.secretsRegistration = registration;
  }

  protected mergeSecretsIntoEnv(opts: {
    bundle: Record<string, string>;
    entry: ISecretHydrateEntry;
  }): Record<string, string> {
    const { bundle, entry } = opts;
    const merged: Record<string, string> = {};

    if (entry.keys) {
      for (const [rawKey, envKey] of Object.entries(entry.keys)) {
        const value = bundle[rawKey];
        if (value !== undefined) {
          merged[envKey] = value;
        }
      }
    } else {
      for (const [rawKey, value] of Object.entries(bundle)) {
        merged[`${entry.prefix ?? ''}${rawKey}`] = value;
      }
    }

    for (const [key, value] of Object.entries(merged)) {
      process.env[key] = value;
    }
    applicationEnvironment.merge({ envs: merged });
    return merged;
  }

  /**
   * A hydrate entry declares an expectation only when it maps explicit `keys` or carries a
   * non-empty `prefix`. Such an entry resolving to zero env values is a misconfiguration the boot
   * must not silently absorb; an entry that declares no expectation can be legitimately empty.
   */
  protected hydrateEntryDeclaresExpectation(opts: { entry: ISecretHydrateEntry }): boolean {
    const { entry } = opts;
    if (entry.keys && Object.keys(entry.keys).length > 0) {
      return true;
    }
    return typeof entry.prefix === 'string' && entry.prefix.length > 0;
  }

  async wireSecretRotatables(): Promise<void> {
    const logger = this.logger.for(this.wireSecretRotatables.name);
    const provider = this.secretsProvider;
    const registration = this.secretsRegistration;
    if (!provider || !registration?.lease?.length) {
      return;
    }
    for (const entry of registration.lease) {
      const instance = this.get<ISecretRotatable>({ key: entry.key, isOptional: true });
      if (instance && typeof instance.onSecretRotated === 'function') {
        provider.registerRotatable({ key: entry.key, target: instance });
        logger.info('Wired rotatable | key: %s', entry.key);
        continue;
      }
      logger.debug('Lease key has no rotatable consumer | key: %s', entry.key);
    }
  }

  booter<Base extends IBooter, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    return this.bind<Base>({
      key: BindingKeys.build(
        opts?.binding ?? { namespace: BindingNamespaces.BOOTERS, key: ctor.name },
      ),
    })
      .toClass(ctor)
      .setTags('booter');
  }

  async registerBooters() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerBooters.name,
      description: 'Register application booters',
      task: async () => {
        this.bind({ key: `@app/boot-options` }).toValue(this.configs.bootOptions ?? {});
        this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);

        this.booter(DatasourceBooter);
        this.booter(RepositoryBooter);
        this.booter(ServiceBooter);
        this.booter(ControllerBooter);
      },
    });
  }

  static(opts: { restPath?: string; folderPath: string }) {
    const { restPath = '*', folderPath } = opts;
    const server = this.getServer();

    switch (this.server.runtime) {
      case RuntimeModules.BUN: {
        const { serveStatic } = require('hono/bun');
        server.use(restPath, serveStatic({ root: folderPath }));
        break;
      }
      case RuntimeModules.NODE: {
        try {
          const { serveStatic } = require('@hono/node-server/serve-static');
          server.use(restPath, serveStatic({ root: folderPath }));
        } catch (error) {
          this.logger.for(this.static.name).error('Failed to serve static file | Error: %s', error);
          throw getError({
            message: `[static] @hono/node-server is required for Node.js runtime. Please install '@hono/node-server'`,
          });
        }
        break;
      }
      default: {
        throw getError({
          message: '[static] Invalid server runtime to config static loader!',
        });
      }
    }

    this.logger
      .for(this.static.name)
      .debug(
        'Registered static files | runtime: %s | path: %s | folder: %s',
        this.server.runtime,
        restPath,
        folderPath,
      );
    return this;
  }

  protected printStartUpInfo(opts: { scope: string }) {
    const { scope } = opts;
    this.logger
      .for(scope)
      .info('------------------------------------------------------------------------');
    this.logger
      .for(scope)
      .info(
        'Starting application... | Name: %s | Env: %s | Runtime: %s',
        APP_ENV_APPLICATION_NAME,
        NODE_ENV,
        this.server.runtime,
      );
    this.logger
      .for(scope)
      .info('AllowEmptyEnv: %s | Prefix: %s', ALLOW_EMPTY_ENV_VALUE, APPLICATION_ENV_PREFIX);
    this.logger.for(scope).info('RunMode: %s', RUN_MODE);
    this.logger.for(scope).info('Timezone: %s', APP_ENV_APPLICATION_TIMEZONE);
    this.logger.for(scope).info('LogPath: %s', APP_ENV_LOGGER_FOLDER_PATH);
    this.logger
      .for(scope)
      .info(
        'Datasource | Migration: %s | Authorize: %s',
        APP_ENV_DS_MIGRATION,
        APP_ENV_DS_AUTHORIZE,
      );
    this.logger
      .for(scope)
      .info('------------------------------------------------------------------------');
  }

  protected async registerDefaultMiddlewares() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDefaultMiddlewares.name,
      description: 'Register default application server handler',
      task: () => {
        const server = this.getServer();

        server.onError(
          new AppErrorMiddleware({
            logger: this.logger,
            rootKey: this.configs.error?.rootKey ?? undefined,
          }).value(),
        );

        if (this.configs.asyncContext?.enable) {
          server.use(contextStorage());
        }

        server.notFound(notFoundHandler({ logger: this.logger }));

        // RequestTrackerComponent assigns request IDs and parses the request body (also works
        // around the Bun + Hono body-parsing bug: https://github.com/honojs/middleware/issues/81).
        this.component(RequestTrackerComponent);

        server.use(emojiFavicon({ icon: this.configs.favicon ?? '🔥' }));
      },
    });
  }

  async boot(): Promise<IBootReport> {
    await this.registerBooters();
    const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
    return bootstrapper.boot({});
  }

  override async initialize() {
    this.printStartUpInfo({ scope: this.initialize.name });
    this.validateEnvs();

    await this.registerDefaultMiddlewares();
    this.staticConfigure();

    await this.preConfigure();

    await this.hydrateSecrets();

    // DataSources must be registered before repositories so they're available for auto-resolution
    await this.registerDataSources();
    await this.registerComponents();

    // Components can contribute datasources, so wire rotatables only after both registration phases;
    // a lease key pointing at a component-contributed datasource would otherwise resolve to nothing.
    await this.wireSecretRotatables();

    await this.registerControllers();

    // Do not register new datasources/components/controllers in postConfigure - they won't be
    // auto-registered; call configure() manually if needed (see registerDataSources/Components/Controllers).
    await this.postConfigure();
  }
}
