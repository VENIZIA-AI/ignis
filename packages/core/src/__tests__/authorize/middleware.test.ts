import { describe, test, expect } from 'bun:test';
import {
  Authorization,
  AuthorizationDecisions,
  AuthorizationEnforcerTypes,
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

describe('Enforcer Registry Middleware Flow', () => {
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
    };

    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue(authorizeOptions);

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

    const middleware = authorize({
      spec: opts.spec,
      enforcerName: opts.enforcerName,
    });

    return { registry, container, middleware };
  };

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
      });

      const context = createMockContext({
        isSkipAuthorize: true,
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should NOT skip when SKIP_AUTHORIZATION is false/unset', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'read', resource: 'User' },
      });

      const context = createMockContext({});

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

      const context = createMockContext({});

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
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

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
        user: { userId: 'user_bad_roles', roles: 'not-an-array' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

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

      const contextName = createMockContext({
        user: {
          userId: 'u1',
          roles: [{ id: 10, name: 'role_name_fallback' }],
        },
      });

      const rsName = await runMiddleware(middleware, contextName);
      expect(rsName.error).toBeUndefined();
      expect(rsName.hasCalledNext).toBe(true);

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
          },
        },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
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

      const cachedRules: TTestRule[] = [{ action: 'read', resource: 'User', effect: 'allow' }];

      const context = createMockContext({
        user: { userId: 'u1' },
        rules: cachedRules,
      });

      await runMiddleware(middleware, context);

      expect(buildCount).toBe(0);
    });
  });

  describe('full enforce flow', () => {
    test('should deny when enforcer evaluate returns false', async () => {
      const { middleware } = setupMiddlewareTest({
        spec: { action: 'delete', resource: 'User' },
        options: {
          rules: [{ action: 'read', resource: 'User', effect: 'allow' }],
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

  describe('graceful handling — no enforcers registered', () => {
    test('should skip authorization when no enforcers are registered', async () => {
      createFreshRegistry();

      const middleware = authorize({
        spec: { action: 'read', resource: 'User' },
      });

      const context = createMockContext({
        user: { userId: 'u1' },
      });

      const { hasCalledNext, error } = await runMiddleware(middleware, context);

      expect(error).toBeUndefined();
      expect(hasCalledNext).toBe(true);
    });

    test('should throw when named enforcer is not found', async () => {
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
      const callLog: string[] = [];

      {
        const { middleware } = setupMiddlewareTest({
          spec: { action: 'read', resource: 'User' },
        });
        const context = createMockContext({ isSkipAuthorize: true });
        const { hasCalledNext } = await runMiddleware(middleware, context);
        expect(hasCalledNext).toBe(true);
      }

      {
        const { middleware } = setupMiddlewareTest({
          spec: { action: 'read', resource: 'User' },
        });
        const context = createMockContext({});
        const { error } = await runMiddleware(middleware, context);
        expect(error?.statusCode).toBe(401);
      }

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
