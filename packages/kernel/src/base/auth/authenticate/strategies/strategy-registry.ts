import { SingletonRealm } from '@/helpers/singleton-realm';
import type { Container } from '@/helpers/inversion/container';
import type { TClass } from '@venizia/ignis-helpers/common';
import { AbstractAuthRegistry } from '../../base';
import type { IAuthenticationStrategy } from '../common';
import { Authentication } from '../common';

export class AuthenticationStrategyRegistry extends AbstractAuthRegistry<IAuthenticationStrategy> {
  static readonly SINGLETON_REAL_KEY = 'authentication-strategy-registry';

  constructor() {
    super({ scope: AuthenticationStrategyRegistry.name });
  }

  static getInstance() {
    return SingletonRealm.resolve({
      key: AuthenticationStrategyRegistry.SINGLETON_REAL_KEY,
      create: () => new AuthenticationStrategyRegistry(),
    });
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
