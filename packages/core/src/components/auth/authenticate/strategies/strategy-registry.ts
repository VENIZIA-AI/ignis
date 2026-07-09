import type { Container } from '@/helpers/inversion/container';
import type { TClass } from '@venizia/ignis-helpers';
import { AbstractAuthRegistry } from '../../base';
import type { IAuthenticationStrategy } from '../common';
import { Authentication } from '../common';

// Authentication Strategy Registry — manages strategy registration and resolution

export class AuthenticationStrategyRegistry extends AbstractAuthRegistry<IAuthenticationStrategy> {
  private static instance: AuthenticationStrategyRegistry;

  constructor() {
    super({ scope: AuthenticationStrategyRegistry.name });
  }

  static getInstance() {
    if (!AuthenticationStrategyRegistry.instance) {
      AuthenticationStrategyRegistry.instance = new AuthenticationStrategyRegistry();
    }

    return AuthenticationStrategyRegistry.instance;
  }

  protected getBindingPrefix(): string {
    return Authentication.AUTHENTICATION_STRATEGY;
  }

  register(opts: {
    container: Container;
    strategies: { strategy: TClass<IAuthenticationStrategy>; name: string }[];
  }) {
    const { container, strategies } = opts;

    for (const { strategy, name } of strategies) {
      this.registerDescriptor({ container, target: strategy, name });
    }

    return this;
  }

  resolveStrategy(opts: { name: string }): IAuthenticationStrategy {
    return this.resolveDescriptor(opts);
  }
}
