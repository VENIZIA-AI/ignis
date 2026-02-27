import { Container } from '@/helpers/inversion/container';
import { getError, TClass } from '@venizia/ignis-helpers';
import { AbstractAuthRegistry } from '../../base';
import {
  Authorization,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  IAuthorizationEnforcer,
  IAuthorizeOptions,
  ICasbinEnforcerOptions,
} from '../common';

// Authorization Enforcer Registry — manages enforcer registration and resolution

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

    // Validate no duplicate names in this batch
    const names = enforcers.map(e => e.name);
    const duplicateNames = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicateNames.length) {
      throw getError({
        message: `[AuthorizationEnforcerRegistry] Duplicate enforcer name(s): ${[...new Set(duplicateNames)].join(', ')}`,
      });
    }

    for (const { enforcer, name, options } of enforcers) {
      // Validate name not already registered
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
