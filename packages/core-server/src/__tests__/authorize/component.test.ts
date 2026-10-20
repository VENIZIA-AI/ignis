import { describe, test, expect } from 'bun:test';
import { AuthorizeBindingKeys } from '@venizia/ignis-kernel';
import type { IAuthorizeOptions } from '@venizia/ignis-kernel';
import { Container } from '@venizia/ignis-kernel';
import { createFreshRegistry } from './helpers';

describe('AuthorizeComponent Lifecycle', () => {
  describe('component with no options', () => {
    test('should have empty registry when no enforcers are registered', () => {
      const registry = createFreshRegistry();

      const enforcersMap = registry['descriptors'];
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
        context: {},
      });
      expect(rs.subject).toBe('user_42');
    });
  });
});
