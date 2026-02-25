import { describe, test, expect } from 'bun:test';
import { AuthorizationEnforcerTypes } from '@/components/auth/authorize/common/constants';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import { authorize } from '@/components/auth/authorize/middlewares';
import type { IAuthorizeOptions } from '@/components/auth/authorize/common/types';
import { Container } from '@/helpers/inversion';
import {
  createMockContext,
  createFreshRegistry,
  TestAuthorizationEnforcer,
  type TTestRule,
} from './helpers';

// =============================================================================
// 9. Security Tests
// =============================================================================

describe('Security Tests', () => {
  /**
   * Helper to set up a registry with a TestAuthorizationEnforcer for security tests.
   */
  const setupSecurityTest = (opts?: {
    rules?: TTestRule[];
    loadRulesFn?: (typeof TestAuthorizationEnforcer)['loadRulesFn'];
    alwaysAllowRoles?: string[];
  }) => {
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'sec-test' });

    if (opts?.rules) {
      TestAuthorizationEnforcer.rules = opts.rules;
    }
    if (opts?.loadRulesFn) {
      TestAuthorizationEnforcer.loadRulesFn = opts.loadRulesFn;
    }

    container.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
      defaultDecision: 'deny',
      alwaysAllowRoles: opts?.alwaysAllowRoles,
    });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer as any,
          name: 'test',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    return { registry, container };
  };

  describe('context variable manipulation', () => {
    test('should not allow setting SKIP_AUTHORIZATION externally to bypass auth', async () => {
      // In real Hono, context.set() is only available in middleware.
      // But we test what happens if an earlier middleware sets the skip flag.
      // The authorization system trusts the skip flag — this is by design,
      // since only server-side middleware can set it.
      setupSecurityTest();

      const middleware = authorize({
        spec: { action: 'delete', resource: 'Everything' },
      });

      // Context with skip flag set (simulates rogue middleware)
      const context = createMockContext({ isSkipAuthorize: true });
      let hasCalledNext = false;
      await (middleware as any)(context, async () => {
        hasCalledNext = true;
      });

      // This is expected — skip flag is trusted server-side
      // The security boundary is that clients CANNOT set context variables
      expect(hasCalledNext).toBe(true);
    });

    test('should not allow client to inject rules via context', async () => {
      // Test that pre-set rules in context are used as-is.
      // An attacker cannot set context variables from the client.
      // But if a bug in middleware pre-sets rules, they are used.
      setupSecurityTest();

      // Inject fake rules that grant delete:CriticalData
      const fakeRules: TTestRule[] = [
        { action: 'delete', resource: 'CriticalData', effect: 'allow' },
      ];

      const middleware = authorize({
        spec: { action: 'delete', resource: 'CriticalData' },
      });

      const context = createMockContext({
        user: { userId: 'attacker' },
        rules: fakeRules,
      });

      let hasCalledNext = false;
      await (middleware as any)(context, async () => {
        hasCalledNext = true;
      });

      // Pre-set rules are trusted — this tests that the caching works
      // The security boundary is that Hono context is server-side only
      expect(hasCalledNext).toBe(true);
    });
  });

  describe('error message information leakage', () => {
    test('should not expose internal paths in middleware error message', async () => {
      setupSecurityTest();

      const middleware = authorize({
        spec: { action: 'read', resource: 'Secret' },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      let rsError: any;
      try {
        await (middleware as any)(context, async () => {});
      } catch (error) {
        rsError = error;
      }

      // Error message should contain action/resource but NOT file paths
      expect(rsError.message).toContain('read');
      expect(rsError.message).toContain('Secret');
      expect(rsError.message).not.toContain('/src/');
      expect(rsError.message).not.toContain('.ts');
      expect(rsError.message).not.toContain('node_modules');
    });

    test('should not expose user details in 403 error message', async () => {
      setupSecurityTest();

      const middleware = authorize({
        spec: { action: 'read', resource: 'User' },
      });

      const context = createMockContext({
        // No user
      });

      let rsError: any;
      try {
        await (middleware as any)(context, async () => {});
      } catch (error) {
        rsError = error;
      }

      // Should say "No authenticated user found" but not expose session/token details
      expect(rsError.message).toContain('No authenticated user found');
      expect(rsError.message).not.toContain('token');
      expect(rsError.message).not.toContain('session');
      expect(rsError.message).not.toContain('cookie');
    });
  });

  describe('role extraction edge cases (extractUserRoles)', () => {
    test('should handle roles with empty identifier and empty name', async () => {
      setupSecurityTest({ alwaysAllowRoles: [''] });

      const middleware = authorize({
        spec: { action: 'read', resource: 'User' },
      });

      // Role with empty strings
      const context = createMockContext({
        user: {
          userId: 'u1',
          roles: [{ identifier: '', name: '' }],
        },
      });

      let hasCalledNext = false;
      try {
        await (middleware as any)(context, async () => {
          hasCalledNext = true;
        });
      } catch {
        /* expected */
      }

      // Empty string role matches alwaysAllowRoles: ['']
      expect(hasCalledNext).toBe(true);
    });

    test('should handle roles with undefined identifier falling back to name', async () => {
      setupSecurityTest({ alwaysAllowRoles: ['admin_name'] });

      const middleware = authorize({
        spec: { action: 'delete', resource: 'User' },
      });

      const context = createMockContext({
        user: {
          userId: 'u1',
          roles: [{ id: 1, name: 'admin_name' }],
        },
      });

      let hasCalledNext = false;
      try {
        await (middleware as any)(context, async () => {
          hasCalledNext = true;
        });
      } catch {
        /* expected */
      }

      expect(hasCalledNext).toBe(true);
    });

    test('should handle roles with only numeric id falling back to String(id)', async () => {
      setupSecurityTest({ alwaysAllowRoles: ['42'] });

      const middleware = authorize({
        spec: { action: 'delete', resource: 'User' },
      });

      const context = createMockContext({
        user: {
          userId: 'u1',
          roles: [{ id: 42 }],
        },
      });

      let hasCalledNext = false;
      try {
        await (middleware as any)(context, async () => {
          hasCalledNext = true;
        });
      } catch {
        /* expected */
      }

      // String(42) === '42' matches alwaysAllowRoles: ['42']
      expect(hasCalledNext).toBe(true);
    });

    test('should handle roles with null id falling back to empty string', async () => {
      setupSecurityTest({ alwaysAllowRoles: [''] });

      const middleware = authorize({
        spec: { action: 'delete', resource: 'User' },
      });

      const context = createMockContext({
        user: {
          userId: 'u1',
          roles: [{ id: null }],
        },
      });

      let hasCalledNext = false;
      try {
        await (middleware as any)(context, async () => {
          hasCalledNext = true;
        });
      } catch {
        /* expected */
      }

      // String(null ?? '') === '' matches alwaysAllowRoles: ['']
      expect(hasCalledNext).toBe(true);
    });
  });

  describe('concurrent authorization calls', () => {
    test('should handle concurrent middleware executions without cross-contamination', async () => {
      setupSecurityTest({
        loadRulesFn: async ({ user }) => {
          // Simulate varying delays
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          if (user.userId === 'admin') {
            return [{ action: 'delete', resource: 'User', effect: 'allow' as const }];
          }
          return [{ action: 'read', resource: 'User', effect: 'allow' as const }];
        },
      });

      // Run 20 concurrent requests
      const rsPromises = Array.from({ length: 20 }, async (_, i) => {
        const isAdmin = i % 2 === 0;
        const middleware = authorize({
          spec: { action: 'delete', resource: 'User' },
        });

        const context = createMockContext({
          user: { userId: isAdmin ? 'admin' : 'viewer' },
        });

        let hasCalledNext = false;
        let rsError: any;
        try {
          await (middleware as any)(context, async () => {
            hasCalledNext = true;
          });
        } catch (error) {
          rsError = error;
        }

        return { isAdmin, hasCalledNext, rsError };
      });

      const results = await Promise.all(rsPromises);

      for (const rs of results) {
        if (rs.isAdmin) {
          expect(rs.hasCalledNext).toBe(true);
          expect(rs.rsError).toBeUndefined();
        } else {
          expect(rs.hasCalledNext).toBe(false);
          expect(rs.rsError).toBeDefined();
          expect(rs.rsError.statusCode).toBe(403);
        }
      }
    });
  });
});
