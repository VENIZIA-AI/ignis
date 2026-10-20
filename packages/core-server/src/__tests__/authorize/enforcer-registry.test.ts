import { describe, test, expect } from 'bun:test';
import { AuthorizationEnforcerTypes, AuthorizeBindingKeys } from '@venizia/ignis-kernel';
import { AuthorizationEnforcerRegistry } from '@venizia/ignis-kernel';
import type { IAuthorizeOptions } from '@venizia/ignis-kernel';
import { Container } from '@venizia/ignis-kernel';
import { createFreshRegistry, TestAuthorizationEnforcer } from './helpers';

describe('AuthorizationEnforcerRegistry', () => {
  test('should be a singleton', () => {
    const instance1 = AuthorizationEnforcerRegistry.getInstance();
    const instance2 = AuthorizationEnforcerRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should generate enforcer keys', () => {
    const registry = AuthorizationEnforcerRegistry.getInstance();
    const key = registry.getKey({ name: 'test' });
    expect(key).toBe('authorization.enforcer.test');
  });

  test('should generate enforcer keys for casbin', () => {
    const registry = AuthorizationEnforcerRegistry.getInstance();
    const key = registry.getKey({ name: 'casbin' });
    expect(key).toBe('authorization.enforcer.casbin');
  });

  describe('register and resolve', () => {
    test('should register an enforcer in the container', () => {
      const registry = createFreshRegistry();
      const container = new Container({ scope: 'test' });

      container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
        defaultDecision: 'deny',
      });

      registry.register({
        container,
        enforcers: [
          {
            enforcer: TestAuthorizationEnforcer,
            name: 'test',
            type: AuthorizationEnforcerTypes.CUSTOM,
          },
        ],
      });

      const isBound = container.isBound({
        key: 'authorization.enforcer.test',
      });
      expect(isBound).toBe(true);
    });

    test('should resolve a registered enforcer from container', async () => {
      const registry = createFreshRegistry();
      const container = new Container({ scope: 'test' });

      container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
        defaultDecision: 'deny',
      });

      registry.register({
        container,
        enforcers: [
          {
            enforcer: TestAuthorizationEnforcer,
            name: 'test',
            type: AuthorizationEnforcerTypes.CUSTOM,
          },
        ],
      });

      const enforcer = await registry.resolveEnforcer({ name: 'test' });
      expect(enforcer).toBeDefined();
      expect(enforcer.name).toBe('test');
    });

    test('should register multiple enforcers', () => {
      const registry = createFreshRegistry();
      const container = new Container({ scope: 'test' });

      container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
        defaultDecision: 'deny',
      });

      class CustomEnforcer extends TestAuthorizationEnforcer {
        override name = 'custom';
      }

      registry.register({
        container,
        enforcers: [
          {
            enforcer: TestAuthorizationEnforcer,
            name: 'test',
            type: AuthorizationEnforcerTypes.CUSTOM,
          },
          {
            enforcer: CustomEnforcer,
            name: 'custom',
            type: AuthorizationEnforcerTypes.CUSTOM,
          },
        ],
      });

      const isBoundTest = container.isBound({ key: 'authorization.enforcer.test' });
      const isBoundCustom = container.isBound({ key: 'authorization.enforcer.custom' });
      expect(isBoundTest).toBe(true);
      expect(isBoundCustom).toBe(true);
    });
  });
});
