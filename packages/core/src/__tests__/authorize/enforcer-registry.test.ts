import { describe, test, expect } from 'bun:test';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import { AuthorizationEnforcerRegistry } from '@/components/auth/authorize/enforcers/enforcer-registry';
import type { IAuthorizeOptions } from '@/components/auth/authorize/common/types';
import { Container } from '@/helpers/inversion';
import { createFreshRegistry, TestAuthorizationEnforcer } from './helpers';

// =============================================================================
// 4. AuthorizationEnforcerRegistry Tests
// =============================================================================

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

      // Bind the options that TestAuthorizationEnforcer needs
      container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
        defaultDecision: 'deny',
        enforcers: { casbin: { name: 'test', model: '', cached: { use: false } } },
      });

      registry.register({
        container,
        enforcers: [{ enforcer: TestAuthorizationEnforcer as any, name: 'test' }],
      });

      // Verify the enforcer was bound in the container
      const isBound = container.isBound({
        key: 'authorization.enforcer.test',
      });
      expect(isBound).toBe(true);
    });

    test('should resolve a registered enforcer from container', () => {
      const registry = createFreshRegistry();
      const container = new Container({ scope: 'test' });

      container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
        defaultDecision: 'deny',
        enforcers: { casbin: { name: 'test', model: '', cached: { use: false } } },
      });

      registry.register({
        container,
        enforcers: [{ enforcer: TestAuthorizationEnforcer as any, name: 'test' }],
      });

      const enforcer = registry.resolveEnforcer({ name: 'test' });
      expect(enforcer).toBeDefined();
      expect(enforcer.name).toBe('test');
    });

    test('should register multiple enforcers', () => {
      const registry = createFreshRegistry();
      const container = new Container({ scope: 'test' });

      container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
        defaultDecision: 'deny',
        enforcers: { casbin: { name: 'test', model: '', cached: { use: false } } },
      });

      // Create a custom enforcer class
      class CustomEnforcer extends TestAuthorizationEnforcer {
        override name = 'custom';
      }

      registry.register({
        container,
        enforcers: [
          { enforcer: TestAuthorizationEnforcer as any, name: 'test' },
          { enforcer: CustomEnforcer as any, name: 'custom' },
        ],
      });

      const isBoundTest = container.isBound({ key: 'authorization.enforcer.test' });
      const isBoundCustom = container.isBound({ key: 'authorization.enforcer.custom' });
      expect(isBoundTest).toBe(true);
      expect(isBoundCustom).toBe(true);
    });
  });
});
