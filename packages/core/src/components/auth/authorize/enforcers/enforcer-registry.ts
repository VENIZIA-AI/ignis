import { Container } from '@/helpers/inversion/container';
import { TClass } from '@venizia/ignis-helpers';
import { AbstractAuthRegistry } from '../../base';
import {
  Authorization,
  AuthorizeBindingKeys,
  IAuthorizationEnforcer,
  IAuthorizeOptions,
} from '../common';

// --------------------------------------------------------------------------------------------------------
// Authorization Enforcer Registry — manages enforcer registration and resolution
// --------------------------------------------------------------------------------------------------------

export class AuthorizationEnforcerRegistry extends AbstractAuthRegistry<IAuthorizationEnforcer> {
  private static instance: AuthorizationEnforcerRegistry;

  private configuredEnforcers: Set<string>;

  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  protected getBindingPrefix(): string {
    return Authorization.AUTHORIZATION_ENFORCER;
  }

  // ---------------------------------------------------------------------------
  register(opts: {
    container: Container;
    enforcers: { enforcer: TClass<IAuthorizationEnforcer>; name: string }[];
  }) {
    const { container, enforcers } = opts;

    for (const { enforcer, name } of enforcers) {
      this.registerDescriptor({ container, target: enforcer, name });
    }

    return this;
  }

  // ---------------------------------------------------------------------------
  getDefaultEnforcerName(): string {
    return this.getDefaultName();
  }

  resolveEnforcer(opts: { name: string }): IAuthorizationEnforcer {
    return this.resolveDescriptor(opts);
  }

  async resolveAndConfigureEnforcer(opts: { name: string }): Promise<IAuthorizationEnforcer> {
    const enforcer = this.resolveEnforcer(opts);

    if (!this.configuredEnforcers.has(opts.name) && enforcer.configure) {
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
