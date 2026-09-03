import type { Container } from '@/helpers/inversion/container';
import { SingletonRealm } from '@/helpers/singleton-realm';
import type { TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
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

  /**
   * The names on this list that no registered strategy answers to.
   *
   * An EMPTY list yields nothing - it is the framework's own encoding of
   * `authenticate: { skip: true }`, so treating it as a problem would flag every public route.
   *
   * Nothing is reported while the registry is empty. Route configs are built during
   * `registerControllers()`, after `preConfigure()` and `registerComponents()`, so a real
   * application has registered by then; an empty registry means this is running outside that
   * lifecycle - a unit test on a controller - where no name could resolve either way.
   */
  findUnregistered(opts: { names: string[] }): string[] {
    const { names } = opts;

    if (names.length === 0 || this.descriptors.size === 0) {
      return [];
    }

    return names.filter(name => !this.has({ name }));
  }

  /**
   * Refuses to continue past an unregistered name. For an APPLICATION's own startup check.
   *
   * The framework does NOT call this - it reports instead. A hard failure cannot be the default
   * here: a route listing several strategies in ANY mode tolerates one that does not resolve, and
   * `defineAuthController` hard-codes `'jwt'` on four of its routes, so an application that
   * registers its JWT strategy under a different name works today and would stop booting.
   */
  assertRegistered(opts: { names: string[]; scope?: string }): void {
    const { names, scope = 'route' } = opts;

    const unregistered = this.findUnregistered({ names });
    if (unregistered.length === 0) {
      return;
    }

    throw getError({
      message: `[${scope}] Unknown authentication strategy | unregistered: ${unregistered.join(', ')} | registered: ${this.getNames().join(', ')} | register it with AuthenticationStrategyRegistry.register() before controllers are bound`,
    });
  }

  /**
   * Names an unregistered strategy at boot, at a level someone sees. Never throws.
   *
   * This is what replaces the guard the open `TAuthStrategy` gave up: `resolveStrategy` throws at
   * request time, the provider's ANY mode swallows it at DEBUG, and the route 401s with nothing to
   * explain why.
   */
  reportUnregistered(opts: { names: string[]; scope?: string }): void {
    const { names, scope = 'route' } = opts;

    const unregistered = this.findUnregistered({ names });
    if (unregistered.length === 0) {
      return;
    }

    this.logger
      .for(this.reportUnregistered.name)
      .error(
        '[%s] Unknown authentication strategy - requests relying on it cannot authenticate | unregistered: %s | registered: %s',
        scope,
        unregistered.join(', '),
        this.getNames().join(', '),
      );
  }
}
