import { GrpcTimeoutGuard } from '@/base/controllers/grpc/timeout.guard';
import type { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import type { AbstractGrpcController } from '@/base/controllers/grpc';
import { BindingNamespaces } from '@venizia/ignis-kernel';
import { Binding, BindingValueTypes, MetadataRegistry } from '@venizia/ignis-kernel';
import { ExecutionFrames, getError } from '@venizia/ignis-helpers/core';
import { HTTP, ObjectUtility } from '@venizia/ignis-helpers/common';
import type { IGrpcComponentConfig, IGrpcNativeOptions } from './common/types';
import { GrpcListenerHelper } from '@/base/controllers/grpc/native/listener.helper';
import { DEFAULT_SHUTDOWN_TIMEOUT_MS } from '@/base/controllers/grpc/native/constants';
import { ToggleUtility } from '@venizia/ignis-kernel';
import { GrpcBindingKeys } from './common/types';

const DEFAULT_OPTIONS: IGrpcComponentConfig = {};

/** Mounts every controller declared with the gRPC transport onto the root router at its metadata `path`, and hands each the `IGrpcComponentConfig` interceptors and ConnectRPC module. A gRPC controller without a service definition is skipped with a warning. */
export class GrpcComponent extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({
      scope: GrpcComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [GrpcBindingKeys.GRPC_COMPONENT_OPTIONS]: Binding.bind({
          key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override async binding(): Promise<void> {
    const logger = this.logger.for(this.binding.name);
    const router = this.application.getRootRouter();

    const options = this.application.get({
      key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS,
      isOptional: true,
    });

    const native = ToggleUtility.pick(options?.native, { name: '[GrpcComponent] native' });
    const shutdown = new AbortController();
    /** The application port's, apart from `shutdown`, which the native listener aborts only for calls of its own. */
    const httpShutdown = new AbortController();
    /** `/package.Service/Method` to where the application mounts it: what the native port serves. */
    const routes = new Map<string, string>();

    // Batch drained before re-scanning - see `RestApplication.registerDynamicBindings` for why.
    const configured = new Set<string>();

    let bindings = this.application.findByTag({
      tag: BindingNamespaces.CONTROLLER,
      exclude: configured,
    });

    while (bindings.length > 0) {
      for (const binding of bindings) {
        if (configured.has(binding.key)) {
          continue;
        }

        const target = binding.getBindingMeta({ type: BindingValueTypes.CLASS });

        if (!target) {
          configured.add(binding.key);
          continue;
        }

        const metadata = MetadataRegistry.getInstance().getControllerMetadata({ target });

        // Skip non-gRPC controllers — they are configured by RestComponent
        if (metadata?.transport !== ControllerTransports.GRPC) {
          configured.add(binding.key);
          continue;
        }

        if (!metadata?.path || ObjectUtility.isEmpty({ value: metadata.path })) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for gRPC controller metadata`,
          });
        }

        const instance = this.application.get<AbstractGrpcController>({
          key: binding.key,
          isOptional: false,
        });

        if (!instance) {
          logger.debug('No binding instance | key: %s', binding.key);
          configured.add(binding.key);
          continue;
        }

        if (!instance.service) {
          logger.warn('gRPC controller has no service definition, skipping | key: %s', binding.key);
          configured.add(binding.key);
          continue;
        }

        instance.connectRpcModule = options?.module;
        instance.interceptors = options?.interceptors;
        instance.limits = options?.limits;
        instance.native = native && { shutdownSignal: shutdown.signal };
        instance.shutdownSignal = httpShutdown.signal;
        instance.idleTimeout = this.application.getProjectConfigs().server?.idleTimeout;
        await instance.configure();

        router.route(metadata.path, instance.getRouter());
        configured.add(binding.key);

        if (native) {
          this.collectRoutes({
            routes,
            controllerPath: metadata.path,
            rpcPaths: instance.rpcPaths,
          });
        }

        logger.info('Configured gRPC controller | key: %s | path: %s', binding.key, metadata.path);
      }

      // Re-fetch excluding already configured — picks up dynamically added controllers
      bindings = this.application.findByTag({
        tag: BindingNamespaces.CONTROLLER,
        exclude: configured,
      });
    }

    // Registered before the native port's hook, which waits: both ports count their timeout from the same moment.
    this.registerApplicationPortShutdown({
      shutdown: httpShutdown,
      timeoutMs: native?.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    });

    if (native) {
      this.registerNativeListener({ native, routes, shutdown });
    }
  }

  /**
   * `stop()` waits for the requests in flight on the application port, so an RPC still running after `timeoutMs` is
   * aborted. The hook only starts the clock; the timer alone keeps no process running.
   */
  private registerApplicationPortShutdown(opts: { shutdown: AbortController; timeoutMs: number }) {
    const { shutdown, timeoutMs } = opts;

    this.application.registerPostStopHook({
      identifier: 'grpc.http.stop',
      hook: () => {
        // A root frame: the `abort` listeners of a handler run inside this call.
        setTimeout(() => ExecutionFrames.root({ task: () => shutdown.abort() }), timeoutMs).unref();
      },
    });
  }

  /** gRPC clients call `/package.Service/Method` with no prefix, so each such path has one owner. */
  private collectRoutes(opts: {
    routes: Map<string, string>;
    controllerPath: string;
    rpcPaths: string[];
  }) {
    const { routes, controllerPath, rpcPaths } = opts;
    const basePath = this.application.getProjectConfigs().path.base;

    for (const rpcPath of rpcPaths) {
      const mounted = `/${basePath}/${controllerPath}${rpcPath}`.replace(/\/+/g, '/');
      const owner = routes.get(rpcPath);

      if (owner) {
        throw getError({
          message: `[GrpcComponent] The native gRPC port serves ${rpcPath} once: two controllers declare it (${owner}, ${mounted})`,
        });
      }

      routes.set(rpcPath, mounted);
    }
  }

  /** The port starts after the HTTP server and stops before it, and before the datasources close. */
  private registerNativeListener(opts: {
    native: IGrpcNativeOptions;
    routes: Map<string, string>;
    shutdown: AbortController;
  }) {
    const { native, routes, shutdown } = opts;
    const idleTimeout = this.application.getProjectConfigs().server?.idleTimeout;
    const listener = new GrpcListenerHelper({
      options: native,
      routes,
      shutdown,
      idleTimeoutMs: (idleTimeout ?? GrpcTimeoutGuard.DEFAULT_IDLE_TIMEOUT_SECONDS) * 1_000,
      fetch: (request, env) => this.application.getServer().fetch(request, env),
    });

    this.application.bind({ key: GrpcBindingKeys.GRPC_NATIVE_LISTENER }).toValue(listener);
    this.application.registerPostStartHook({
      identifier: 'grpc.native.start',
      hook: () => listener.start(),
    });
    // Post-stop hooks run before the server and the datasources close.
    this.application.registerPostStopHook({
      identifier: 'grpc.native.stop',
      hook: () => listener.stop(),
    });
  }
}
