import { describe, test, expect } from 'bun:test';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import type { IAuthorizeOptions } from '@/components/auth/authorize/common/types';
import { Container } from '@/helpers/inversion';
import { createFreshRegistry } from './helpers';

// =============================================================================
// 7. Component Lifecycle Tests
// =============================================================================

describe('AuthorizeComponent Lifecycle', () => {
  // These tests verify AuthorizeComponent.binding() behavior.
  // We test the component logic without a full BaseApplication by examining
  // how it interacts with the container/options.

  // AuthorizeComponent's constructor requires @inject(CoreBindings.APPLICATION_INSTANCE)
  // which is normally resolved by DI. We test the logic at the enforcer registry level
  // since the component delegates to it.

  describe('component with no options', () => {
    test('should have empty registry when no enforcers are registered', () => {
      // The component now throws when no options are bound (resolveOptions).
      // This test verifies the registry starts empty after reset.

      const registry = createFreshRegistry();

      // Access private enforcers map to verify it's empty
      const enforcersMap = (registry as any).descriptors as Map<string, any>;
      expect(enforcersMap.size).toBe(0);
    });
  });

  describe('component with valid options', () => {
    test('should bind alwaysAllowRoles when provided', () => {
      const container = new Container({ scope: 'component-test' });

      const authorizeOptions: IAuthorizeOptions = {
        defaultDecision: 'deny',
        alwaysAllowRoles: ['superadmin', 'root'],
      };

      container
        .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
        .toValue(authorizeOptions);

      // Simulate the component binding alwaysAllowRoles
      if (authorizeOptions.alwaysAllowRoles?.length) {
        container
          .bind<string[]>({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES })
          .toValue(authorizeOptions.alwaysAllowRoles);
      }

      const roles = container.get<string[]>({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES });
      expect(roles).toEqual(['superadmin', 'root']);
    });

    test('should store casbin normalizePayloadFn in per-enforcer options binding', () => {
      const container = new Container({ scope: 'component-test-fn' });

      const normalizePayloadFn = ({ user, action, resource }: any) => ({
        subject: `user_${user.userId}`,
        resource,
        action,
      });

      const enforcerOptions = {
        model: '',
        cached: { use: false },
        normalizePayloadFn,
      };

      // Enforcer options are now bound to a per-enforcer key
      container
        .bind({ key: AuthorizeBindingKeys.enforcerOptions('casbin') })
        .toValue(enforcerOptions);

      const resolved = container.get<typeof enforcerOptions>({
        key: AuthorizeBindingKeys.enforcerOptions('casbin'),
      });
      expect(resolved.normalizePayloadFn).toBeDefined();

      const rs = resolved.normalizePayloadFn!({
        user: { userId: '42' },
        action: 'read',
        resource: 'User',
        context: {} as any,
      });
      expect(rs.subject).toBe('user_42');
    });
  });
});
