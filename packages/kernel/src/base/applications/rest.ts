import type { TBindingNamespace } from '@/common/bindings';
import { BindingNamespaces, CoreBindings } from '@/common/bindings';
import type { Binding, TBindingScope } from '@/helpers/inversion';
import { BindingKeys, BindingScopes, MetadataRegistry } from '@/helpers/inversion';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { IConfigurable, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  executeWithPerformanceMeasure,
  getError,
  RequestIdGenerator,
} from '@venizia/ignis-helpers/core';
import type { Env, Schema } from 'hono';
import { showRoutes as showApplicationRoutes } from 'hono/dev';
import { requestId } from 'hono/request-id';
import type { BaseComponent } from '../components';
import { RestComponent } from '../components/controller/rest/rest.component';
import { ControllerTransports } from '../controllers/common/constants';
import type { IDataSource } from '../datasources';
import { BaseAppErrorMiddleware } from '../middlewares/app-error/app-error.middleware';
import { notFoundHandler } from '../middlewares/not-found/not-found.middleware';
import type { TMixinOpts } from '../mixins/types';
import type { IRepository } from '../repositories';
import type { IService } from '../services';
import { AbstractApplication } from './abstract';
import type { IBootSequenceStep } from './boot-sequence';
import { BootSteps } from './boot-sequence';
import type { IApplicationConfigs } from './types';

interface IRegisterDynamicBindingsOptions<T extends IConfigurable = IConfigurable> {
  namespace: TBindingNamespace;

  onBeforeConfigure?: (opts: { binding: Binding<T> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<T>; instance: T }) => Promise<void>;
}

/** Adds the `OpenAPIHono` router surface on top of `AbstractApplication` - no listening server, so this is the layer a browser Worker or gRPC-only host can extend without pulling in `Bun.serve` / `@hono/node-server`. */
export abstract class RestApplication<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
> extends AbstractApplication {
  private registeredBindings: Record<string, Set<string>> = {};

  /** The router, and nothing else. What runtime is underneath and what socket is bound are `ServerApplication`'s to know - a browser Worker has neither, and carrying the union here made `RuntimeModules.detect()` answer `'node'` inside a Worker. */
  protected server: { hono: OpenAPIHono<AppEnv, AppSchema, BasePath> };

  protected rootRouter: OpenAPIHono<AppEnv, AppSchema, BasePath>;
  protected readonly requestIdGenerator: RequestIdGenerator;

  constructor(opts: { scope: string; config: IApplicationConfigs }) {
    super(opts);

    this.requestIdGenerator = new RequestIdGenerator({ scope: opts.scope });

    const honoServer = new OpenAPIHono<AppEnv, AppSchema, BasePath>({
      strict: this.configs.strictPath ?? true,
    });
    this.rootRouter = new OpenAPIHono({
      strict: this.configs.strictPath ?? true,
    });

    this.server = { hono: honoServer };
  }

  getRootRouter(): OpenAPIHono<AppEnv, AppSchema, BasePath> {
    return this.rootRouter;
  }

  getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath> {
    return this.server.hono;
  }

  protected override registerCoreBindings() {
    super.registerCoreBindings();

    this.bind<typeof this.server>({
      key: CoreBindings.APPLICATION_SERVER,
    }).toProvider(_ => this.server);
    this.bind<typeof this.rootRouter>({
      key: CoreBindings.APPLICATION_ROOT_ROUTER,
    }).toProvider(_ => this.rootRouter);
  }

  /** The correlation id every host stamps - see {@link RequestIdGenerator} for why `crypto.randomUUID` is refused. */
  protected generateRequestId(): string {
    return this.requestIdGenerator.nextId();
  }

  /** The error handler the default stack installs. `@venizia/ignis` overrides it to swap in the `ErrorPrettier`-backed formatter, which reaches `node:util` and so cannot live here. */
  protected buildErrorMiddleware(): BaseAppErrorMiddleware {
    const environment = this.configs.error?.environment;

    return new BaseAppErrorMiddleware({
      logger: this.logger,
      rootKey: this.configs.error?.rootKey ?? undefined,
      // Spread, not `environment: () => environment`: the option's PRESENCE is what claims this host
      // has an ambient environment at all, so an unset config must leave it absent.
      ...(environment === undefined ? {} : { environment: () => environment }),
    });
  }

  /**
   * The three registrations every host needs: request id, error envelope, JSON 404 - without them a
   * thrown `ApplicationError` is a generic 500, a 404 is `text/plain`, and no response carries a request id.
   * Registered before `initialize()`, so an application's own handlers still win.
   */
  protected registerDefaultMiddlewares(): ValueOrPromise<void> {
    const server = this.getServer();

    server.use(requestId({ generator: () => this.generateRequestId() }));
    server.onError(this.buildErrorMiddleware().value());
    server.notFound(notFoundHandler({ logger: this.logger }));
  }

  /**
   * The artifact order, stated once: datasources before the repositories that auto-resolve them,
   * components before the controllers they may contribute. `BaseApplication` splices its server-only
   * steps around these by name instead of rewriting the list.
   */
  protected getBootSequence(): IBootSequenceStep[] {
    return [
      { name: BootSteps.STATIC_CONFIGURE, run: () => this.staticConfigure() },
      { name: BootSteps.PRE_CONFIGURE, run: () => this.preConfigure() },
      { name: BootSteps.REGISTER_DATA_SOURCES, run: () => this.registerDataSources() },
      { name: BootSteps.REGISTER_COMPONENTS, run: () => this.registerComponents() },
      {
        name: BootSteps.REGISTER_CONTRIBUTED_DATA_SOURCES,
        run: () => this.registerContributedDataSources(),
      },
      { name: BootSteps.REGISTER_CONTROLLERS, run: () => this.registerControllers() },
      { name: BootSteps.POST_CONFIGURE, run: () => this.postConfigure() },
    ];
  }

  async initialize(): Promise<void> {
    await this.runBootSequence({ steps: this.getBootSequence() });
  }

  /** One measured log line per step, and a failure names its step before rethrowing, so a hung or failed boot is attributable without reading the sequence. */
  protected async runBootSequence(opts: { steps: IBootSequenceStep[] }): Promise<void> {
    const { steps } = opts;
    const logger = this.logger.for(this.initialize.name);
    const t = performance.now();

    for (const [index, step] of steps.entries()) {
      try {
        await executeWithPerformanceMeasure({
          logger: this.logger,
          scope: this.initialize.name,
          description: `Boot step ${index + 1}/${steps.length} ${step.name}`,
          task: () => step.run(),
        });
      } catch (error) {
        logger.error(
          'Boot step failed | step: %s (%d/%d) | error: %s',
          step.name,
          index + 1,
          steps.length,
          error,
        );
        throw error;
      }
    }

    logger.info(
      'Boot sequence complete | %d step(s) | Took: %s (ms) | %s',
      steps.length,
      performance.now() - t,
      steps.map(step => step.name).join(' -> '),
    );
  }

  protected inspectRoutes() {
    const t = performance.now();
    const shouldShowRoutes = this.configs?.debug?.shouldShowRoutes ?? false;

    if (!shouldShowRoutes) {
      return;
    }

    this.logger.for(this.inspectRoutes.name).info('START | Inspect all application route(s)');
    showApplicationRoutes(this.getServer());
    this.logger
      .for(this.inspectRoutes.name)
      .info('DONE | Inspect all application route(s) | Took: %s (ms)', performance.now() - t);
  }

  /**
   * `configured` is the drain's state, mutated in place: a fresh `Set` gives a one-shot complete
   * drain (`RestComponent`); `registerDynamicBindings` passes its persistent per-namespace `Set`,
   * which is why a second sweep touches only what the first one missed.
   */
  async drainByTag<T>(opts: {
    tag: string;
    configured: Set<string>;
    onEach: (opts: { binding: Binding<T> }) => Promise<void>;
  }): Promise<void> {
    const { tag, configured, onEach } = opts;

    // A whole batch is drained before re-scanning: the re-scan exists only to pick up bindings a
    // `configure()` added, and asking after every single item makes boot N+1 full scans of the
    // binding map - 3.5ms at 200 controllers, against 0.04ms for this shape.
    let bindings = this.findByTag<T>({ tag, exclude: configured });

    while (bindings.length > 0) {
      for (const binding of bindings) {
        // Within a batch a nested `configure()` may already have taken this one.
        if (configured.has(binding.key)) {
          continue;
        }

        await onEach({ binding });
        configured.add(binding.key);
      }

      // Re-fetch excluding already configured - picks up dynamically added bindings
      bindings = this.findByTag<T>({ tag, exclude: configured });
    }
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

    await this.drainByTag<T>({
      tag: namespace,
      configured,
      onEach: async ({ binding }) => {
        if (onBeforeConfigure) {
          await onBeforeConfigure({ binding });
        }

        const instance = this.get<T>({ key: binding.key, isOptional: false });
        if (!instance) {
          logger.debug('No binding instance | namespace: %s | key: %s', namespace, binding.key);
          return;
        }

        await instance.configure();

        // Marked before the after-hook runs, so the hook sees its own binding as configured.
        configured.add(binding.key);

        if (onAfterConfigure) {
          await onAfterConfigure({ binding, instance });
        }
      },
    });
  }

  /** The same-key guard behind every artifact registration (`component`/`controller`/`service`/`repository`/`dataSource`, and core-server's `booter`). `allowOverride` defaults true to match `bind()`'s overwrite behavior - `allowOverride: false` opts into strict mode. */
  protected assertNoBindingCollision(opts: {
    key: string;
    allowOverride?: boolean;
    caller: string;
  }): void {
    const { key, allowOverride = true, caller } = opts;

    if (allowOverride || !this.isBound({ key })) {
      return;
    }

    throw getError({
      message: `[${caller}] Binding key already registered: '${key}' | 'allowOverride: false' was set and this key collides with an existing binding | Use a distinct 'opts.binding' key, or drop 'allowOverride: false' if overriding is intentional`,
    });
  }

  /** Resolution order for every registration: explicit `opts` > the class's `@injectable` defaults > the derived key and the kind's default scope. `order` and `when` are `registerArtifacts`' concern, not this one. */
  private registerArtifact<Base>(opts: {
    ctor: TClass<Base>;
    namespace: TBindingNamespace;
    defaultScope: TBindingScope;
    caller: string;
    opts?: TMixinOpts;
  }): Binding<Base> {
    const { ctor, namespace, defaultScope, caller } = opts;
    const declared = MetadataRegistry.getInstance().getArtifactMetadata({ target: ctor });

    const key = BindingKeys.build(
      opts.opts?.binding ?? declared?.binding ?? { namespace, key: ctor.name },
    );
    this.assertNoBindingCollision({
      key,
      allowOverride: opts.opts?.allowOverride ?? declared?.allowOverride,
      caller,
    });

    return this.bind<Base>({ key })
      .toClass(ctor)
      .setScope(declared?.scope ?? defaultScope);
  }

  component<Base extends BaseComponent>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base> {
    return this.registerArtifact({
      ctor,
      namespace: BindingNamespaces.COMPONENT,
      defaultScope: BindingScopes.SINGLETON,
      caller: this.component.name,
      opts,
    });
  }

  async registerComponents(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerComponents.name,
      description: 'Register application components',
      task: async () => {
        await this.registerDynamicBindings({ namespace: BindingNamespaces.COMPONENT });
      },
    });
  }

  /**
   * Second DATASOURCE sweep, for datasources components contributed at any depth. Calls
   * `registerDynamicBindings` directly: `this.registerDataSources()` is polymorphic and an override
   * would run twice. Runs after every component, so a component a datasource registers is never configured.
   */
  async registerContributedDataSources(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      scope: this.registerContributedDataSources.name,
      description: 'Register application contributed data sources',
      task: async () => {
        await this.registerDynamicBindings({ namespace: BindingNamespaces.DATASOURCE });
      },
    });
  }

  /** REST only - the kernel has no gRPC (it reaches `node:module`). `BaseApplication` adds the gRPC branch on top. */
  async registerControllers(): Promise<void> {
    await executeWithPerformanceMeasure({
      logger: this.logger,
      description: 'Register application REST controllers',
      scope: this.registerControllers.name,
      task: async () => {
        const transports = this.configs.transports ?? [ControllerTransports.REST];
        if (!transports.includes(ControllerTransports.REST)) {
          return;
        }

        const restComponent = new RestComponent(this);
        await restComponent.configure();
      },
    });
  }

  /** SINGLETON like `component()`: `RestComponent` mounts the one instance it resolves, so a second resolution must be that instance, not an unmounted twin. */
  controller<Base>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base> {
    return this.registerArtifact({
      ctor,
      namespace: BindingNamespaces.CONTROLLER,
      defaultScope: BindingScopes.SINGLETON,
      caller: this.controller.name,
      opts,
    });
  }

  service<Base extends IService>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base> {
    return this.registerArtifact({
      ctor,
      namespace: BindingNamespaces.SERVICE,
      defaultScope: BindingScopes.TRANSIENT,
      caller: this.service.name,
      opts,
    });
  }

  repository<Base extends IRepository>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base> {
    return this.registerArtifact({
      ctor,
      namespace: BindingNamespaces.REPOSITORY,
      defaultScope: BindingScopes.TRANSIENT,
      caller: this.repository.name,
      opts,
    });
  }

  dataSource<Base extends IDataSource>(ctor: TClass<Base>, opts?: TMixinOpts): Binding<Base> {
    return this.registerArtifact({
      ctor,
      namespace: BindingNamespaces.DATASOURCE,
      defaultScope: BindingScopes.SINGLETON,
      caller: this.dataSource.name,
      opts,
    });
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
}
