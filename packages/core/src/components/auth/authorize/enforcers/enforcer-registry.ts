import type { Container } from '@/helpers/inversion/container';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IAuthUser } from '../../authenticate';
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
  private static instance: AuthorizationEnforcerRegistry;

  private configuredEnforcers: Set<string>;

  constructor() {
    super({ scope: AuthorizationEnforcerRegistry.name });
    this.configuredEnforcers = new Set();
  }

  static getInstance() {
    if (!AuthorizationEnforcerRegistry.instance) {
      AuthorizationEnforcerRegistry.instance = new AuthorizationEnforcerRegistry();
    }

    return AuthorizationEnforcerRegistry.instance;
  }

  override reset(): void {
    super.reset();
    this.configuredEnforcers.clear();
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

  async resolveEnforcer(opts: { name: string }): Promise<IAuthorizationEnforcer> {
    const enforcer = this.resolveDescriptor(opts);

    if (!this.configuredEnforcers.has(opts.name)) {
      await enforcer.configure();
      this.configuredEnforcers.add(opts.name);
    }

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

  resolveOptions(): IAuthorizeOptions | undefined {
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
