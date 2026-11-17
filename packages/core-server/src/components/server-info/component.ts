import { type BaseApplication } from '@/base/applications';
import { controller, inject } from '@/base/metadata';
import { BaseComponent, Binding, CoreBindings } from '@venizia/ignis-kernel';
import { ServerInfoBindingKeys, type IServerInfoOptions } from './common';
import { ServerInfoController } from './controller';

const DEFAULT_REST_PATH = '/server/info';
const DEFAULT_OPTIONS: IServerInfoOptions = {
  restOptions: { path: DEFAULT_REST_PATH },
};

/**
 * Mounts the server info controller: `GET <path>/time`, public, no authentication.
 *
 * The rule of this component: it carries only data that is safe to publish and does not help an
 * attacker. No version, runtime, pid, memory or environment - those stay in the gated
 * `/health/stats`. It is separate from `HealthCheckComponent` on purpose: operators may lock
 * `/health/*` away, and client features must not depend on it. `/server/info/*` is public by design.
 *
 * @example
 * ```typescript
 * import { BaseApplication, ServerInfoComponent, type IServerInfoOptions } from '@venizia/ignis';
 *
 * abstract class App extends BaseApplication {
 *   preConfigure(): void {
 *     const options: IServerInfoOptions = { restOptions: { path: '/clock' } };
 *     this.component(ServerInfoComponent, { options });
 *   }
 * }
 * ```
 */
export class ServerInfoComponent extends BaseComponent<IServerInfoOptions> {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: ServerInfoComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [ServerInfoBindingKeys.SERVER_INFO_OPTIONS]: Binding.bind<IServerInfoOptions>({
          key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  /** Options given at the call site win over anything bound earlier, as in `HealthCheckComponent`. */
  override async configure(opts?: IServerInfoOptions): Promise<void> {
    // The base short-circuits a second call; binding before that check would swap the options
    // under routes that were already mounted from the first ones.
    if (this.isConfigured) {
      return;
    }

    if (opts !== undefined) {
      this.application
        .bind<IServerInfoOptions>({ key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS })
        .toValue(opts);
    }

    await super.configure(opts);
  }

  override binding(): void {
    const options = this.application.get<IServerInfoOptions>({
      key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS,
      isOptional: true,
    });

    // A partially filled options binding (env/config driven) must not take the app down at boot.
    const path = options?.restOptions?.path ?? DEFAULT_REST_PATH;

    // `@controller` writes the PATH onto this shared class in the process-wide MetadataRegistry;
    // two applications booted concurrently with different paths would race, as in health-check.
    Reflect.decorate([controller({ path })], ServerInfoController);
    this.application.controller(ServerInfoController);
  }
}
