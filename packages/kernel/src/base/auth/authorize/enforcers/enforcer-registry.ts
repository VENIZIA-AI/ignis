import { SingletonRealm } from '@/helpers/singleton-realm';
import type { Container } from '@/helpers/inversion/container';
import type { TClass, TNullable } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IAuthUser } from '../../authenticate/common/types';
import { AbstractAuthRegistry } from '../../base';
import type {
  AuthorizationEnforcerTypes,
  IAuthorizationEnforcer,
  IAuthorizationUser,
  IAuthorizeOptions,
  ICasbinEnforcerOptions,
} from '../common';
import { Authorization, AuthorizeBindingKeys } from '../common';

export class AuthorizationEnforcerRegistry extends AbstractAuthRegistry<IAuthorizationEnforcer> {
  static readonly SINGLETON_REAL_KEY = 'authorization-enforcer-registry';

  private configuredEnforcers: Set<string>;

  /** In-flight `configure()` calls, so concurrent first requests share one warmup instead of racing. */
  private pendingConfigurations: Map<string, Promise<void>>;

  /** Set by AuthorizeComponent from the application container. Held here because the descriptor scan
   * below sees only registered enforcers, and `defaultDecision` has to be readable when there are none. */
  private applicationOptions: TNullable<IAuthorizeOptions> = null;

  constructor() {
    super({ scope: AuthorizationEnforcerRegistry.name });
    this.configuredEnforcers = new Set();
    this.pendingConfigurations = new Map();
  }

  static getInstance() {
    return SingletonRealm.resolve({
      key: AuthorizationEnforcerRegistry.SINGLETON_REAL_KEY,
      create: () => new AuthorizationEnforcerRegistry(),
    });
  }

  override reset(): void {
    super.reset();
    this.configuredEnforcers.clear();
    this.pendingConfigurations.clear();
    this.applicationOptions = null;
  }

  protected getBindingPrefix(): string {
    return Authorization.ENFORCER;
  }

  register(opts: {
    container: Container;
    enforcers: Array<
      | {
          enforcer: TClass<IAuthorizationEnforcer>;
          name: string;
          type: typeof AuthorizationEnforcerTypes.CASBIN;
          options?: ICasbinEnforcerOptions;
        }
      | {
          enforcer: TClass<IAuthorizationEnforcer>;
          name: string;
          type: typeof AuthorizationEnforcerTypes.CUSTOM;
          options?: unknown;
        }
    >;
  }) {
    const { container, enforcers } = opts;

    const names = enforcers.map(e => e.name);
    const duplicateNames = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicateNames.length) {
      throw getError({
        message: `[AuthorizationEnforcerRegistry] Duplicate enforcer name(s): ${[...new Set(duplicateNames)].join(', ')}`,
      });
    }

    for (const { enforcer, name, options } of enforcers) {
      if (this.descriptors.has(name)) {
        throw getError({
          message: `[AuthorizationEnforcerRegistry] Enforcer already registered: ${name}`,
        });
      }

      this.registerDescriptor({ container, target: enforcer, name });

      if (options) {
        container.bind({ key: AuthorizeBindingKeys.enforcerOptions(name) }).toValue(options);
      }
    }

    return this;
  }

  hasEnforcers(): boolean {
    return this.descriptors.size > 0;
  }

  getDefaultEnforcerName(): string {
    return this.getDefaultName();
  }

  /**
   * The PROMISE is memoised, not just the completed flag.
   *
   * `configure()` yields (it dynamic-imports casbin), and the flag was only set after the await -
   * so a burst of first requests each saw an unconfigured enforcer and each built a full pool.
   * Measured: 40 concurrent first requests produced 40 configure() calls and 640 enforcers.
   * The entry is dropped on rejection so a failed warmup does not poison every later request.
   */
  async resolveEnforcer(opts: { name: string }): Promise<IAuthorizationEnforcer> {
    const enforcer = this.resolveDescriptor(opts);

    if (this.configuredEnforcers.has(opts.name)) {
      return enforcer;
    }

    const inFlight = this.pendingConfigurations.get(opts.name);
    if (inFlight) {
      await inFlight;
      return enforcer;
    }

    // `Promise.resolve` because `configure()` is declared `ValueOrPromise<void>` - a synchronous
    // implementation returns plain `void`, which has no `.then`.
    const pending = Promise.resolve(enforcer.configure())
      .then(() => {
        this.configuredEnforcers.add(opts.name);
      })
      .finally(() => {
        this.pendingConfigurations.delete(opts.name);
      });

    this.pendingConfigurations.set(opts.name, pending);

    await pending;
    return enforcer;
  }

  /** Drop a user's cached policies on the resolved enforcer. Lazy - next request rebuilds. */
  async invalidateUserCache(opts: {
    user: IAuthorizationUser;
    enforcerName?: string;
  }): Promise<{ invalidatedKeys: number }> {
    const name = opts.enforcerName ?? this.getDefaultEnforcerName();
    const enforcer = await this.resolveEnforcer({ name });

    // Cache management is an optional IAuthorizationEnforcer capability - feature-detect it.
    if (typeof enforcer.invalidateUserCache !== 'function') {
      throw getError({
        message: `[AuthorizationEnforcerRegistry] Enforcer "${name}" does not support cache invalidation`,
      });
    }

    return enforcer.invalidateUserCache({ user: opts.user });
  }

  /** Drop then immediately rebuild + re-cache a user's policies on the resolved enforcer. */
  async rebuildUserCache(opts: {
    user: { principalType: string } & IAuthUser;
    enforcerName?: string;
  }): Promise<{ cacheKey: string; lineCount: number }> {
    const name = opts.enforcerName ?? this.getDefaultEnforcerName();
    const enforcer = await this.resolveEnforcer({ name });

    if (typeof enforcer.rebuildUserCache !== 'function') {
      throw getError({
        message: `[AuthorizationEnforcerRegistry] Enforcer "${name}" does not support cache invalidation`,
      });
    }

    return enforcer.rebuildUserCache({ user: opts.user });
  }

  /** Options bound on the application, independent of any enforcer. */
  setOptions(opts: { options: IAuthorizeOptions }): void {
    this.applicationOptions = opts.options;
  }

  resolveOptions(): IAuthorizeOptions | undefined {
    if (this.applicationOptions) {
      return this.applicationOptions;
    }

    for (const [, metadata] of this.descriptors) {
      const { container } = metadata;
      const options = container.get<IAuthorizeOptions>({
        key: AuthorizeBindingKeys.OPTIONS,
        isOptional: true,
      });
      if (options) {
        return options;
      }
    }
    return undefined;
  }
}
