import { describe, test, expect } from 'bun:test';
import {
  Authorization,
  AuthorizationDecisions,
  type TAuthorizationDecision,
} from '@/components/auth/authorize/common/constants';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import { authorize } from '@/components/auth/authorize/middlewares';
import type {
  IAuthorizeOptions,
  IAuthorizationSpec,
  TAuthorizationVoter,
} from '@/components/auth/authorize/common/types';
import type { IAuthUser } from '@/components/auth/authenticate/common/types';
import { Container } from '@/helpers/inversion';
import {
  createMockContext,
  createFreshRegistry,
  TestAuthorizationEnforcer,
  type TTestRule,
} from './helpers';

// =============================================================================
// 5. Middleware Integration Tests (Enforcer Registry authorize())
// =============================================================================

describe('Enforcer Registry Middleware Flow', () => {
  /**
   * Helper to set up a registry with a TestAuthorizationEnforcer and run
   * the authorize() middleware against a mock context.
   */
  const setupMiddlewareTest = (opts: {
    options?: {
      defaultDecision?: TAuthorizationDecision;
      alwaysAllowRoles?: string[];
      rules?: TTestRule[];
      loadRulesFn?: (typeof TestAuthorizationEnforcer)['loadRulesFn'];
      onBuildRules?: () => void;
    };
    spec: IAuthorizationSpec;
    enforcerName?: string;
  }) => {
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'middleware-test' });

    // Set static fields on TestAuthorizationEnforcer
    if (opts.options?.rules) {
      TestAuthorizationEnforcer.rules = opts.options.rules;
    }
    if (opts.options?.loadRulesFn) {
      TestAuthorizationEnforcer.loadRulesFn = opts.options.loadRulesFn;
    }
    if (opts.options?.onBuildRules) {
      TestAuthorizationEnforcer.onBuildRules = opts.options.onBuildRules;
    }

    const authorizeOptions: IAuthorizeOptions = {
      defaultDecision: opts.options?.defaultDecision ?? 'deny',
      alwaysAllowRoles: opts.options?.alwaysAllowRoles,
      enforcers: {
        casbin: { name: 'test', model: '', cached: { use: false } },
      },
    };

    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue(authorizeOptions);

    registry.register({
      container,
      enforcers: [{ enforcer: TestAuthorizationEnforcer as any, name: 'test' }],
    });

    const middleware = authorize({
      spec: opts.spec,
      enforcerName: opts.enforcerName,
    });

    return { registry, container, middleware };
  };

  /**
   * Runs the middleware handler with a mock context and tracks whether next() was called.
   */
  const runMiddleware = async (
    middleware: any,
    context: ReturnType<typeof createMockContext>,
  ): Promise<{ hasCalledNext: boolean; error?: any }> => {
    let hasCalledNext = false;
    const next = async () => {
      hasCalledNext = true;
    };

    try {
      await middleware(context, next);
      return { hasCalledNext };
    } catch (error) {
      return { hasCalledNext, error };
    }
  };

  describe('skip authorization flag', () => {
    test('should skip authorization when SKIP_AUTHORIZATION is set', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        // No rules — would normally deny
      });

      const context = createMockContext({
        isSkipAuthorize: true,
        // No user at all — should still skip without error
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should NOT skip when SKIP_AUTHORIZATION is false/unset', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
      });

      const context = createMockContext({
        // No user -> will fail at step 2
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
    });
  });

  describe('authenticated user check', () => {
    test('should throw 401 when no authenticated user is found', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
      });

      const context = createMockContext({
        // user is undefined
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('No authenticated user found');
    });

    test('should proceed when user exists', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'user_1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });
  });

  describe('alwaysAllowRoles bypass', () => {
    test('should bypass authorization for user with always-allow role', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'delete', resource: 'CriticalResource' },
        options: {
          alwaysAllowRoles: ['superadmin'],
          // No rules defined — normally would deny
        },
      });

      const context = createMockContext({
        user: {
          userId: 'admin_1',
          roles: [{ id: 1, identifier: 'superadmin', name: 'Super Admin' }],
        },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should NOT bypass when user does not have the always-allow role', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'delete', resource: 'CriticalResource' },
        options: {
          alwaysAllowRoles: ['superadmin'],
          // No delete permission
          rules: [{ action: 'read', resource: 'CriticalResource', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: {
          userId: 'user_1',
          roles: [{ id: 2, identifier: 'viewer', name: 'Viewer' }],
        },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(403);
    });

    test('should bypass when user has one of multiple always-allow roles', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'delete', resource: 'AuditLog' },
        options: {
          alwaysAllowRoles: ['superadmin', 'root'],
          // No permissions — deny all
        },
      });

      const context = createMockContext({
        user: {
          userId: 'root_user',
          roles: [{ id: 3, identifier: 'root', name: 'Root' }],
        },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should handle user with no roles array', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        options: {
          alwaysAllowRoles: ['admin'],
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'user_no_roles' },
        // No roles property at all
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      // Should not crash — extractUserRoles returns []
      // Then proceeds to enforcer which allows read:User
      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should handle user with roles as non-array', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        options: {
          alwaysAllowRoles: ['admin'],
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'user_bad_roles', roles: 'not-an-array' as any },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      // extractUserRoles checks Array.isArray, returns []
      // Falls through to enforcer, which allows read:User
      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });
  });

  describe('per-route allowedRoles', () => {
    test('should bypass when user has an allowed role for the route', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'delete',
          resource: 'User',
          allowedRoles: ['moderator'],
        },
        options: {
          // No delete permission — would deny
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: {
          userId: 'mod_1',
          roles: [{ id: 5, identifier: 'moderator', name: 'Moderator' }],
        },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should NOT bypass when user lacks the allowed role', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'delete',
          resource: 'User',
          allowedRoles: ['moderator'],
        },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: {
          userId: 'viewer_1',
          roles: [{ id: 6, identifier: 'viewer', name: 'Viewer' }],
        },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      // Falls through to enforcer — no delete:User rule, denied
      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(403);
    });

    test('should extract role identifier with fallback to name then id', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          allowedRoles: ['role_name_fallback', '99'],
        },
      });

      // Role with only `name` (no identifier)
      const contextName = createMockContext({
        user: {
          userId: 'u1',
          roles: [{ id: 10, name: 'role_name_fallback' }],
        },
      });

      const rsName = await runMiddleware(middleware, contextName);
      expect(rsName.error).toBeUndefined();
      expect(rsName.hasCalledNext).toBe(true);

      // Role with only `id` (no identifier, no name)
      const contextId = createMockContext({
        user: {
          userId: 'u2',
          roles: [{ id: 99 }],
        },
      });

      const rsId = await runMiddleware(middleware, contextId);
      expect(rsId.error).toBeUndefined();
      expect(rsId.hasCalledNext).toBe(true);
    });
  });

  describe('voter execution', () => {
    test('should deny when a voter returns DENY', async () => {
      const denyVoter: TAuthorizationVoter = async (): Promise<TAuthorizationDecision> =>
        AuthorizationDecisions.DENY;

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          voters: [denyVoter],
        },
        options: {
          rules: [{ action: 'manage', resource: 'all', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('denied by voter');
    });

    test('should allow immediately when a voter returns ALLOW', async () => {
      let hasCalledEnforcer = false;

      const allowVoter: TAuthorizationVoter = async (): Promise<TAuthorizationDecision> =>
        AuthorizationDecisions.ALLOW;

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          voters: [allowVoter],
        },
        options: {
          onBuildRules: () => {
            hasCalledEnforcer = true;
            // This should NOT be called if voter ALLOWs
          },
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
      // Enforcer buildRules should NOT have been called
      expect(hasCalledEnforcer).toBe(false);
    });

    test('should fall through to enforcer when voter returns ABSTAIN', async () => {
      const abstainVoter: TAuthorizationVoter = async (): Promise<TAuthorizationDecision> =>
        AuthorizationDecisions.ABSTAIN;

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          voters: [abstainVoter],
        },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should process voters in order — first DENY wins', async () => {
      const callOrder: string[] = [];

      const voter1: TAuthorizationVoter = async () => {
        callOrder.push('voter1');
        return AuthorizationDecisions.ABSTAIN as TAuthorizationDecision;
      };
      const voter2: TAuthorizationVoter = async () => {
        callOrder.push('voter2');
        return AuthorizationDecisions.DENY as TAuthorizationDecision;
      };
      const voter3: TAuthorizationVoter = async () => {
        callOrder.push('voter3');
        return AuthorizationDecisions.ALLOW as TAuthorizationDecision;
      };

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          voters: [voter1, voter2, voter3],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { error } = await runMiddleware(middleware, context);

      expect(error).toBeDefined();
      expect(error.statusCode).toBe(403);
      // voter3 should NOT have been called because voter2 denied
      expect(callOrder).toEqual(['voter1', 'voter2']);
    });

    test('should process voters in order — first ALLOW wins', async () => {
      const callOrder: string[] = [];

      const voter1: TAuthorizationVoter = async () => {
        callOrder.push('voter1');
        return AuthorizationDecisions.ABSTAIN as TAuthorizationDecision;
      };
      const voter2: TAuthorizationVoter = async () => {
        callOrder.push('voter2');
        return AuthorizationDecisions.ALLOW as TAuthorizationDecision;
      };
      const voter3: TAuthorizationVoter = async () => {
        callOrder.push('voter3');
        return AuthorizationDecisions.DENY as TAuthorizationDecision;
      };

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          voters: [voter1, voter2, voter3],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
      // voter3 should NOT have been called because voter2 allowed
      expect(callOrder).toEqual(['voter1', 'voter2']);
    });

    test('should pass correct user and spec to voter', async () => {
      let capturedUser: IAuthUser | undefined;
      let capturedAction: string | undefined;
      let capturedResource: string | undefined;

      const inspectVoter: TAuthorizationVoter = async ({ user, action, resource }) => {
        capturedUser = user;
        capturedAction = action;
        capturedResource = resource;
        return AuthorizationDecisions.ALLOW as TAuthorizationDecision;
      };

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'update',
          resource: 'Post',
          voters: [inspectVoter],
        },
      });

      const context = createMockContext({
        user: { userId: 'voter_test_user' },
      });

      await runMiddleware(middleware, context);

      expect(capturedUser?.userId).toBe('voter_test_user');
      expect(capturedAction).toBe('update');
      expect(capturedResource).toBe('Post');
    });

    test('should fall through to enforcer when all voters ABSTAIN', async () => {
      const voter1: TAuthorizationVoter = async (): Promise<TAuthorizationDecision> =>
        AuthorizationDecisions.ABSTAIN;
      const voter2: TAuthorizationVoter = async (): Promise<TAuthorizationDecision> =>
        AuthorizationDecisions.ABSTAIN;

      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'read',
          resource: 'User',
          voters: [voter1, voter2],
        },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });
  });

  describe('ability caching in context', () => {
    test('should cache rules in context after first build', async () => {
      let buildCount = 0;

      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
          onBuildRules: () => {
            buildCount++;
          },
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      await runMiddleware(middleware, context);

      // After middleware runs, rules should be cached in context
      const cachedRules = context._store.get(Authorization.RULES);
      expect(cachedRules).toBeDefined();
      expect(Array.isArray(cachedRules)).toBe(true);
      expect(buildCount).toBe(1);
    });

    test('should reuse cached rules from context (not rebuild)', async () => {
      let buildCount = 0;

      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
          onBuildRules: () => {
            buildCount++;
          },
        },
      });

      // Pre-populate cached rules
      const cachedRules: TTestRule[] = [{ action: 'read', resource: 'User', effect: 'allow' }];

      const context = createMockContext({
        user: { userId: 'u1' },
        rules: cachedRules,
      });

      await runMiddleware(middleware, context);

      // onBuildRules should NOT have been called since rules were cached
      expect(buildCount).toBe(0);
    });
  });

  describe('full enforce flow', () => {
    test('should deny when enforcer evaluate returns false', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'delete', resource: 'User' },
        options: {
          rules: [
            { action: 'read', resource: 'User', effect: 'allow' },
            // No delete permission
          ],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Authorization denied');
      expect(error.message).toContain('delete');
      expect(error.message).toContain('User');
    });

    test('should allow when enforcer evaluate returns true', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should pass spec conditions to enforcer evaluate', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'update',
          resource: 'Post',
          conditions: { ownerId: 'user_1' },
        },
        options: {
          rules: [
            {
              action: 'update',
              resource: 'Post',
              effect: 'allow',
              conditions: { ownerId: 'user_1' },
            },
          ],
        },
      });

      const context = createMockContext({
        user: { userId: 'user_1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should deny when conditions do not match', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: {
          action: 'update',
          resource: 'Post',
          conditions: { ownerId: 'user_2' },
        },
        options: {
          rules: [
            {
              action: 'update',
              resource: 'Post',
              effect: 'allow',
              conditions: { ownerId: 'user_1' },
            },
          ],
        },
      });

      const context = createMockContext({
        user: { userId: 'user_2' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(hasCalledNext).toBe(false);
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(403);
    });
  });

  describe('error handling — no enforcers registered', () => {
    test('should throw when no enforcers are registered', async () => {
      createFreshRegistry();

      // Create middleware without registering any enforcer
      const middleware = authorize({
        spec: { action: 'read', resource: 'User' },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { error } = await runMiddleware(middleware, context);

      expect(error).toBeDefined();
      expect(error.message).toContain('No items registered');
    });

    test('should throw when named enforcer is not found', async () => {
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

      const middleware = authorize({
        spec: { action: 'read', resource: 'User' },
        enforcerName: 'nonexistent',
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { error } = await runMiddleware(middleware, context);

      expect(error).toBeDefined();
      expect(error.message).toContain('Descriptor not found: nonexistent');
    });
  });

  describe('middleware precedence chain (full order)', () => {
    test('skip > user check > alwaysAllowRoles > allowedRoles > voters > enforcer', async () => {
      // This test verifies the entire precedence chain by ensuring each step
      // short-circuits appropriately.
      const callLog: string[] = [];

      // Step 1: skip flag
      {
        const { middleware } = setupMiddlewareTest({
          spec: { action: 'read', resource: 'User' },
        });
        const context = createMockContext({ isSkipAuthorize: true });
        const { hasCalledNext } = await runMiddleware(middleware, context);
        expect(hasCalledNext).toBe(true);
      }

      // Step 2: user check
      {
        const { middleware } = setupMiddlewareTest({
          spec: { action: 'read', resource: 'User' },
        });
        const context = createMockContext({});
        const { error } = await runMiddleware(middleware, context);
        expect(error?.statusCode).toBe(401);
      }

      // Step 3: alwaysAllowRoles
      {
        const { middleware } = setupMiddlewareTest({
          spec: { action: 'delete', resource: 'Everything' },
          options: {
            alwaysAllowRoles: ['god'],
            onBuildRules: () => {
              callLog.push('enforcer_should_not_run');
            },
          },
        });
        const context = createMockContext({
          user: {
            userId: 'god_user',
            roles: [{ id: 1, identifier: 'god' }],
          },
        });
        const { hasCalledNext } = await runMiddleware(middleware, context);
        expect(hasCalledNext).toBe(true);
        expect(callLog).not.toContain('enforcer_should_not_run');
      }

      // Step 4: allowedRoles
      {
        const { middleware } = setupMiddlewareTest({
          spec: {
            action: 'delete',
            resource: 'Everything',
            allowedRoles: ['editor'],
          },
          options: {
            onBuildRules: () => {
              callLog.push('enforcer_should_not_run_2');
            },
          },
        });
        const context = createMockContext({
          user: {
            userId: 'editor_user',
            roles: [{ id: 2, identifier: 'editor' }],
          },
        });
        const { hasCalledNext } = await runMiddleware(middleware, context);
        expect(hasCalledNext).toBe(true);
        expect(callLog).not.toContain('enforcer_should_not_run_2');
      }

      // Step 5: voters ALLOW
      {
        const { middleware } = setupMiddlewareTest({
          spec: {
            action: 'read',
            resource: 'User',
            voters: [async (): Promise<TAuthorizationDecision> => AuthorizationDecisions.ALLOW],
          },
          options: {
            onBuildRules: () => {
              callLog.push('enforcer_should_not_run_3');
            },
          },
        });
        const context = createMockContext({
          user: { userId: 'u1' },
        });
        const { hasCalledNext } = await runMiddleware(middleware, context);
        expect(hasCalledNext).toBe(true);
        expect(callLog).not.toContain('enforcer_should_not_run_3');
      }
    });
  });
});
