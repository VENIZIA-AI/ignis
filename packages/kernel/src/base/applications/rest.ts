import type { TBindingNamespace } from '@/common/bindings';
import { BindingNamespaces, CoreBindings } from '@/common/bindings';
import type { Binding } from '@/helpers/inversion';
import { BindingKeys, BindingScopes } from '@/helpers/inversion';
import type { BaseComponent } from '../components';
import { RestComponent } from '../components/controller/rest/rest.component';
import { ControllerTransports } from '../controllers/common/constants';
import type { IDataSource } from '../datasources';
import type { IRepository } from '../repositories';
import type { IService } from '../services';
import type { TMixinOpts } from '../mixins/types';
import { OpenAPIHono } from '@hono/zod-openapi';
import type {
  AnyObject,
  IConfigurable,
  TClass,
  ValueOrPromise,
} from '@venizia/ignis-helpers/common';
import {
  executeWithPerformanceMeasure,
  getError,
  RequestIdGenerator,
} from '@venizia/ignis-helpers/core';
import type { Env, Schema } from 'hono';
import { showRoutes as showApplicationRoutes } from 'hono/dev';
import { requestId } from 'hono/request-id';
import { BaseAppErrorMiddleware } from '../middlewares/app-error/app-error.middleware';
import { notFoundHandler } from '../middlewares/not-found/not-found.middleware';
import { AbstractApplication } from './abstract';
import type { IBootSequenceStep } from './boot-sequence';
import type { IApplicationConfigs } from './types';

interface IRegisterDynamicBindingsOptions<T extends IConfigurable = IConfigurable> {
  namespace: TBindingNamespace;

  onBeforeConfigure?: (opts: { binding: Binding<T> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<T>; instance: T }) => Promise<void>;
}

/** Guards the artifact-registration methods (`component`/`controller`/`service`/`repository`/`dataSource`, and core-server's `booter`) against a silent same-key clobber. `allowOverride` defaults true to match `bind()`'s historical behavior - a caller opts into strict mode by passing `allowOverride: false`. */
export const assertNoBindingCollision = (opts: {
  container: { isBound: (opts: { key: string }) => boolean };
  key: string;
  allowOverride?: boolean;
  caller: string;
}): void => {
  const { container, key, allowOverride = true, caller } = opts;

  if (allowOverride || !container.isBound({ key })) {
    return;
  }

  throw getError({
    message: `[${caller}] Binding key already registered: '${key}' | 'allowOverride: false' was set and this key collides with an existing binding | Use a distinct 'opts.binding' key, or drop 'allowOverride: false' if overriding is intentional`,
  });
};

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
   * The three registrations every host needs, in one place, so a server and a browser Worker cannot
   * drift: a request id, the framework's error envelope, and a JSON 404.
   *
   * None is optional. Hono's own defaults answer a thrown `ApplicationError` with a generic 500 and
   * an unrouted path with `text/plain` - a caller doing `response.json()` on that 404 gets a
   * `SyntaxError` instead of an error envelope. And without `requestId()`, `context.get(REQUEST_ID_KEY)`
   * is `undefined`, so `context.json` drops the one field that ties a response to a log line.
   *
   * Registered before `initialize()`, so an application installing its own handlers still wins.
   */
  protected registerDefaultMiddlewares(): ValueOrPromise<void> {
    const server = this.getServer();

    server.use(requestId({ generator: () => this.generateRequestId() }));
    server.onError(this.buildErrorMiddleware().value());
    server.notFound(notFoundHandler({ logger: this.logger }));
  }

  /**
   * The artifact ordering, stated ONCE: datasources before repositories can auto-resolve them, and
   * components before controllers because a component may contribute either.
   *
   * A browser Worker application inherits this and writes none of it. `BaseApplication` in
   * `@venizia/ignis` is the one deliberate override - it interleaves phases only a server has
   * (start-up banner, env validation, secret hydration and rotation) between these steps.
   */
  protected getBootSequence(): IBootSequenceStep[] {
    return [
      { name: 'staticConfigure', run: () => this.staticConfigure() },
      { name: 'preConfigure', run: () => this.preConfigure() },
      { name: 'registerDataSources', run: () => this.registerDataSources() },
      { name: 'registerComponents', run: () => this.registerComponents() },
      { name: 'registerContributedDataSources', run: () => this.registerContributedDataSources() },
      { name: 'registerControllers', run: () => this.registerControllers() },
      { name: 'postConfigure', run: () => this.postConfigure() },
    ];
  }

  async initialize(): Promise<void> {
    for (const step of this.getBootSequence()) {
      await step.run();
    }
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
   * Drains every binding under `tag`, re-scanning until a batch adds nothing new. `configured` is
   * required and mutated in place - it IS the drain's state, not a cache of it. Pass a fresh `Set`
   * for a one-shot drain (`RestComponent` does this); pass the persistent per-namespace `Set` from
   * `registeredBindings` to make repeat calls incremental (`registerDynamicBindings` does this,
   * which is why a second sweep over the same namespace only touches what the first one missed).
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

        if (onAfterConfigure) {
          await onAfterConfigure({ binding, instance });
        }
      },
    });
  }

  component<Base extends BaseComponent, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    const key = BindingKeys.build(
      opts?.binding ?? { namespace: BindingNamespaces.COMPONENT, key: ctor.name },
    );
    assertNoBindingCollision({
      container: this,
      key,
      allowOverride: opts?.allowOverride,
      caller: 'component',
    });

    return this.bind<Base>({ key }).toClass(ctor).setScope(BindingScopes.SINGLETON);
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
   * A second DATASOURCE sweep: any component - at any nesting depth - may have contributed one
   * during registerComponents(). `registerDynamicBindings`'s per-namespace `configured` set means
   * this only touches what the first pass missed.
   *
   * Calls `registerDynamicBindings` directly rather than `this.registerDataSources()` - the latter
   * is polymorphic, so a subclass override of `registerDataSources()` would otherwise run twice.
   *
   * Runs strictly after `registerComponents()` finishes, not interleaved with it: a datasource that
   * registers a component from its own `configure()` never gets that component configured.
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

  /**
   * Handles the REST branch only - the kernel has no notion of gRPC (it reaches `node:module` via
   * `AbstractGrpcController`, core-only). `BaseApplication` extends this with the gRPC branch, the
   * unsupported-transport error and the orphaned-gRPC-controller warning.
   */
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

  controller<Base, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    const key = BindingKeys.build(
      opts?.binding ?? { namespace: BindingNamespaces.CONTROLLER, key: ctor.name },
    );
    assertNoBindingCollision({
      container: this,
      key,
      allowOverride: opts?.allowOverride,
      caller: 'controller',
    });

    return this.bind<Base>({ key }).toClass(ctor);
  }

  service<Base extends IService, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    const key = BindingKeys.build(
      opts?.binding ?? { namespace: BindingNamespaces.SERVICE, key: ctor.name },
    );
    assertNoBindingCollision({
      container: this,
      key,
      allowOverride: opts?.allowOverride,
      caller: 'service',
    });

    return this.bind<Base>({ key }).toClass(ctor);
  }

  repository<Base extends IRepository, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    const key = BindingKeys.build(
      opts?.binding ?? { namespace: BindingNamespaces.REPOSITORY, key: ctor.name },
    );
    assertNoBindingCollision({
      container: this,
      key,
      allowOverride: opts?.allowOverride,
      caller: 'repository',
    });

    return this.bind<Base>({ key }).toClass(ctor);
  }

  dataSource<Base extends IDataSource, Args extends AnyObject = any>(
    ctor: TClass<Base>,
    opts?: TMixinOpts<Args>,
  ): Binding<Base> {
    const key = BindingKeys.build(
      opts?.binding ?? { namespace: BindingNamespaces.DATASOURCE, key: ctor.name },
    );
    assertNoBindingCollision({
      container: this,
      key,
      allowOverride: opts?.allowOverride,
      caller: 'dataSource',
    });

    return this.bind<Base>({ key }).toClass(ctor).setScope(BindingScopes.SINGLETON);
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
