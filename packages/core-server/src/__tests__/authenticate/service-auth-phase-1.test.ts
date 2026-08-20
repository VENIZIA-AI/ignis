import { describe, expect, test, beforeEach } from 'bun:test';
import {
  AuthenticateStrategy,
  AuthenticationStrategyRegistry,
  Container,
  type IAuthUser,
  type IAuthenticationStrategy,
  type TAuthStrategy,
  type TContext,
} from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * Phase 1 of the service-to-service authentication change, pinned against BANA's own acceptance
 * criteria. Each block names the criterion it answers.
 */

class ServiceStrategy implements IAuthenticationStrategy {
  name = 'service';

  async authenticate(_context: TContext): Promise<IAuthUser> {
    return { userId: 1 };
  }
}

const freshRegistry = (): AuthenticationStrategyRegistry => {
  const registry = AuthenticationStrategyRegistry.getInstance();
  registry.reset();
  return registry;
};

describe('a third strategy name typechecks with no cast', () => {
  /**
   * The criterion is a COMPILE-time one, so the assertion that matters is that this file builds:
   * `strategies` is `TAuthStrategy[]`, and 'service' is neither 'basic' nor 'jwt'.
   * `scripts/rebuild.sh` type-checks `__tests__`, so a narrowed alias fails the build here.
   */
  test('an application name sits alongside the built-ins in a strategy list', () => {
    // Typed as TAuthStrategy[] ON PURPOSE. `AnyType` here would make the test a tautology: it would
    // still compile against the narrow `'basic' | 'jwt'` alias, so it would prove nothing about the
    // widening it claims to pin.
    const strategies: TAuthStrategy[] = [AuthenticateStrategy.JWT, 'service'];

    expect(strategies).toEqual(['jwt', 'service']);
  });

  /** The same assertion one level down, where a route actually declares it. */
  test('a route config accepts an application strategy name', () => {
    const authenticate: { strategies?: TAuthStrategy[] } = { strategies: ['service'] };

    expect(authenticate.strategies).toEqual(['service']);
  });

  /** The built-ins stay literal, which is what keeps autocomplete working after the widening. */
  test('the built-in values are unchanged', () => {
    expect(AuthenticateStrategy.BASIC).toBe('basic');
    expect(AuthenticateStrategy.JWT).toBe('jwt');
  });

  /**
   * `isValid` knows the framework's two only. It is a public export so it stays, but it is not the
   * source of truth for a route's strategy list - and a reader who wires it into one would reject
   * every application-registered strategy.
   */
  test('AuthenticateStrategy.isValid still answers for the built-ins ONLY', () => {
    expect(AuthenticateStrategy.isValid('jwt')).toBe(true);
    expect(AuthenticateStrategy.isValid('service')).toBe(false);
  });
});

describe('the registry is the source of truth for a strategy name', () => {
  let registry: AuthenticationStrategyRegistry;

  beforeEach(() => {
    registry = freshRegistry();
    registry.register({
      container: new Container({ scope: 'service-auth-test' }),
      strategies: [{ name: 'service', strategy: ServiceStrategy }],
    });
  });

  test('has() answers for a registered name and a typo alike', () => {
    expect(registry.has({ name: 'service' })).toBe(true);
    expect(registry.has({ name: 'servcie' })).toBe(false);
  });

  test('getNames() lists what is registered, for a caller building its own check', () => {
    expect(registry.getNames()).toEqual(['service']);
  });

  test('findUnregistered picks out only the names that do not resolve', () => {
    expect(registry.findUnregistered({ names: ['service', 'servcie'] })).toEqual(['servcie']);
    expect(registry.findUnregistered({ names: ['service'] })).toEqual([]);
  });

  /** For an application that wants a hard startup failure. The framework does not call this. */
  test('assertRegistered names the typo AND what was available', () => {
    expect(() =>
      registry.assertRegistered({ names: ['servcie'], scope: 'OrderController' }),
    ).toThrow(/OrderController.*servcie.*registered: service/s);
  });

  test('assertRegistered passes a registered name', () => {
    expect(() => registry.assertRegistered({ names: ['service'] })).not.toThrow();
  });

  /**
   * What the FRAMEWORK does, and it must never throw. `defineAuthController` hard-codes `'jwt'` on
   * four of its routes, and a route listing several strategies in ANY mode tolerates one that does
   * not resolve - throwing here would stop applications booting that work today.
   */
  test('reportUnregistered never throws, whatever it finds', () => {
    expect(() =>
      registry.reportUnregistered({ names: ['servcie'], scope: 'OrderController' }),
    ).not.toThrow();
    expect(() => registry.reportUnregistered({ names: ['service'] })).not.toThrow();
    expect(() => registry.reportUnregistered({ names: [] })).not.toThrow();
  });

  /**
   * `strategies: []` is the framework's own encoding of `authenticate: { skip: true }`. A check that
   * rejected it would break every intentionally public route.
   */
  test('an EMPTY list is always accepted - it means skip, not misconfigured', () => {
    expect(() => registry.assertRegistered({ names: [] })).not.toThrow();
  });

  /**
   * Route configs are built during `registerControllers()`, after registration. An empty registry
   * means this is running outside that lifecycle, where no name could resolve either way.
   */
  test('nothing is reported while the registry is empty', () => {
    freshRegistry();

    expect(
      AuthenticationStrategyRegistry.getInstance().findUnregistered({ names: ['anything'] }),
    ).toEqual([]);
  });
});

/**
 * The regression this suite exists to prevent, and the reason the framework reports rather than
 * throws.
 *
 * `defineAuthController` hard-codes `strategies: ['jwt']` on four routes it registers
 * unconditionally. An application that registers its JWT strategy under a custom name - the exact
 * configuration this release adds support for - has 'jwt' unregistered. A boot-time THROW would
 * kill such an application at `registerControllers()`, so the feature would break the configuration
 * it shipped to enable.
 */
describe('a route naming an unregistered strategy still builds', () => {
  test('building route middlewares does not throw when a name does not resolve', async () => {
    const registry = freshRegistry();
    registry.register({
      container: new Container({ scope: 'custom-name-test' }),
      strategies: [{ name: 'service-jwt', strategy: ServiceStrategy }],
    });

    const { AbstractRestController } = await import('@venizia/ignis-kernel');

    class ProbeController extends (AbstractRestController as AnyType) {
      constructor() {
        super({ scope: 'ProbeController', path: '/probe' });
      }
      async binding(): Promise<void> {}
    }

    const controller = new ProbeController() as AnyType;

    // 'jwt' is what the framework's own auth controller asks for, and it is not registered here.
    expect(() =>
      controller.buildRouteMiddlewares({
        configs: { authenticate: { strategies: ['jwt'] } },
      }),
    ).not.toThrow();
  });
});
