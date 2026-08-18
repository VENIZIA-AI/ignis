import { ControllerTransports } from '@venizia/ignis-kernel';
import { BindingNamespaces, CoreBindings } from '@venizia/ignis-kernel';
import { RequestTrackerComponent } from '@/components';
import { GrpcComponent } from '@/components/controller/grpc';
import type { Binding } from '@venizia/ignis-kernel';
import {
  BindingKeys,
  BindingScopes,
  BindingValueTypes,
  MetadataRegistry,
  RequestContextRegistry,
} from '@venizia/ignis-kernel';
import type { IBootableApplication, IBooter, IBootReport } from '@venizia/ignis-boot';
import {
  Bootstrapper,
  ControllerBooter,
  DatasourceBooter,
  RepositoryBooter,
  ServiceBooter,
} from '@venizia/ignis-boot';
import type { ILogger } from '@venizia/ignis-helpers/core';
import type { AnyObject, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import type {
  ISecretHydrateEntry,
  ISecretRotatable,
  ISecretsHelper,
  ISecretsRegistration,
} from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP, RuntimeModules } from '@venizia/ignis-helpers/common';
import {
  applicationEnvironment,
  createSecretsHelper,
  Environment,
  executeWithPerformanceMeasure,
  SecretProviders,
  toBoolean,
} from '@venizia/ignis-helpers';
import { contextStorage, tryGetContext } from 'hono/context-storage';
import isEmpty from 'lodash/isEmpty';
import type { TMixinOpts } from '@venizia/ignis-kernel';
import { AppErrorMiddleware, emojiFavicon } from '../middlewares';
import { ServerApplication } from './server';
import type { IRestApplication } from '@venizia/ignis-kernel';

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

/** Maps a secret bundle to env names: the explicit `keys` mapping when present, otherwise every bundle key under `prefix`. */
const selectSecretEnvKeys = (opts: {
  bundle: Record<string, string>;
  entry: ISecretHydrateEntry;
}): Record<string, string> => {
  const { bundle, entry } = opts;
  const merged: Record<string, string> = {};

  if (!entry.keys) {
    for (const [rawKey, value] of Object.entries(bundle)) {
      merged[`${entry.prefix ?? ''}${rawKey}`] = value;
    }

    return merged;
  }

  for (const [rawKey, envKey] of Object.entries(entry.keys)) {
    const value = bundle[rawKey];
    if (value === undefined) {
      continue;
    }

    merged[envKey] = value;
  }

  return merged;
};

export abstract class BaseApplication
  extends ServerApplication
  implements IRestApplication, IBootableApplication
{
  protected secretsProvider?: ISecretsHelper;
  protected secretsRegistration?: ISecretsRegistration;

  protected normalizePath(...segments: string[]): string {
    const joined = segments.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
    return joined || '/';
  }

  /**
   * Extends the inherited REST registration (`RestApplication.registerControllers()`, kernel) with
   * the gRPC branch, which the kernel cannot own: `GrpcComponent` needs `AbstractGrpcController`
   * from `@/base/controllers/grpc`, core-only code that reaches `node:module`.
   */
  override async registerControllers(): Promise<void> {
    await super.registerControllers();

    await executeWithPerformanceMeasure({
      logger: this.logger,
      description: 'Register application gRPC controllers',
      scope: this.registerControllers.name,
      task: async () => {
        const transports = this.configs.transports ?? [ControllerTransports.REST];

        for (const transport of transports) {
          if (transport === ControllerTransports.REST) {
            continue;
          }

          if (transport !== ControllerTransports.GRPC) {
            throw getError({
              statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
              message: `[registerControllers] Unsupported transport: '${transport}'`,
            });
          }

          const grpcComponent = new GrpcComponent(this);
          await grpcComponent.configure();
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

      await this.hydrateSecretEntries({ provider, registration, emptyHydrations, logger });

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

  /** Applies each hydrate entry in declaration order; paths that resolve empty while declaring an expectation are collected in `emptyHydrations` rather than failing here. */
  protected async hydrateSecretEntries(opts: {
    provider: ISecretsHelper;
    registration: ISecretsRegistration;
    emptyHydrations: string[];
    logger: ILogger;
  }): Promise<void> {
    const { provider, registration, emptyHydrations, logger } = opts;

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
  }

  protected mergeSecretsIntoEnv(opts: {
    bundle: Record<string, string>;
    entry: ISecretHydrateEntry;
  }): Record<string, string> {
    const { bundle, entry } = opts;
    const merged = selectSecretEnvKeys({ bundle, entry });

    for (const [key, value] of Object.entries(merged)) {
      process.env[key] = value;
    }
    applicationEnvironment.merge({ envs: merged });
    return merged;
  }

  /** A hydrate entry declares an expectation only via explicit `keys` or a non-empty `prefix`; such an entry resolving to zero env values is a misconfiguration boot must not silently absorb. */
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

    switch (this.runtime) {
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
        this.runtime,
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
        this.runtime,
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

  /** Swaps in the `ErrorPrettier`-backed formatter - `node:util`, so the kernel cannot build it. */
  protected override buildErrorMiddleware(): AppErrorMiddleware {
    return new AppErrorMiddleware({
      logger: this.logger,
      rootKey: this.configs.error?.rootKey ?? undefined,
    });
  }

  /** Adds what only a listening server has, on top of the kernel's three - which stay in `RestApplication` so a browser Worker answers with the same envelope. */
  protected override async registerDefaultMiddlewares() {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerDefaultMiddlewares.name,
      description: 'Register default application server handler',
      task: async () => {
        const server = this.getServer();

        await super.registerDefaultMiddlewares();

        // Deliberately NOT inside the `asyncContext.enable` branch below. `tryGetContext()` already
        // answers "no request context" when no store exists, so installing it always costs nothing
        // and keeps a `contextStorage()` an application registered itself visible to the enrichers -
        // which is what reading `hono/context-storage` directly used to do. A method body, not this
        // module's body: every package here declares `sideEffects: false`.
        RequestContextRegistry.setResolver({ resolver: () => tryGetContext() });

        if (this.configs.asyncContext?.enable) {
          server.use(contextStorage());
        }

        // Request-body parsing and the access log; the request id it reads is already installed
        // above (also works around the Bun + Hono body-parsing bug: https://github.com/honojs/middleware/issues/81).
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

  /** Lives here rather than on `AbstractApplication` - `applicationEnvironment` reads `process.env` at module load, so a kernel-pure ancestor cannot carry it; this is the layer that already depends on it. */
  protected validateEnvs() {
    const t = performance.now();
    const envKeys = applicationEnvironment.keys();
    this.logger
      .for(this.initialize.name)
      .info('Envs: %s | START Validating application environments...', envKeys.length);

    for (const argKey of envKeys) {
      const argValue = applicationEnvironment.get<string | number>(argKey);

      if (toBoolean(process.env.ALLOW_EMPTY_ENV_VALUE) || !isEmpty(argValue)) {
        continue;
      }

      throw getError({
        message: `[validateEnvs] Invalid Application Environment! Key: ${argKey} | Value: ${argValue}`,
      });
    }

    this.logger
      .for(this.validateEnvs.name)
      .info(
        'Envs: %s | DONE Validating application environments | Took: %s (ms)',
        envKeys.length,
        performance.now() - t,
      );
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

    // Components can contribute datasources, so wire rotatables only after both registration phases - a lease key pointing at a component-contributed datasource would otherwise resolve to nothing.
    await this.wireSecretRotatables();

    await this.registerControllers();

    // Do not register new datasources/components/controllers in postConfigure - they are not auto-registered; call configure() manually if needed.
    await this.postConfigure();
  }
}
