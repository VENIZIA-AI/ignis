import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import {
  Authorization,
  AuthorizationDecisions,
  type TAuthorizationDecision,
} from '@/components/auth/authorize/common/constants';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import { AuthorizationEnforcerRegistry } from '@/components/auth/authorize/enforcers/enforcer-registry';
import { Authentication } from '@/components/auth/authenticate/common/constants';
import type {
  IAuthorizationEnforcer,
  IAuthorizationRequest,
  IAuthorizeOptions,
} from '@/components/auth/authorize/common/types';
import type { IAuthUser } from '@/components/auth/authenticate/common/types';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Env } from 'hono';

// =============================================================================
// Test rule type
// =============================================================================

export type TTestRule = {
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  conditions?: Record<string, unknown>;
};

// =============================================================================
// TestAuthorizationEnforcer — lightweight test double for middleware testing
// =============================================================================

export class TestAuthorizationEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<Env, string, string, TTestRule[]>
{
  name = 'test';

  // Static fields set per-test for behavior control
  static rules: TTestRule[] = [];
  static loadRulesFn?: (opts: { user: IAuthUser; context: TContext }) => Promise<TTestRule[]>;
  static onBuildRules?: () => void;

  constructor(
    @inject({ key: AuthorizeBindingKeys.OPTIONS })
    private options: IAuthorizeOptions,
  ) {
    super({ scope: TestAuthorizationEnforcer.name });
  }

  configure(): void {
    // No initialization needed for test enforcer
  }

  async buildRules(opts: {
    user: { principalType: string } & IAuthUser;
    context: TContext;
  }): Promise<TTestRule[]> {
    TestAuthorizationEnforcer.onBuildRules?.();

    if (TestAuthorizationEnforcer.loadRulesFn) {
      return TestAuthorizationEnforcer.loadRulesFn(opts);
    }

    return TestAuthorizationEnforcer.rules;
  }

  async evaluate(opts: {
    rules: TTestRule[];
    request: IAuthorizationRequest;
    context: TContext;
  }): Promise<TAuthorizationDecision> {
    const { rules, request } = opts;

    if (!rules || rules.length === 0) {
      return this.options.defaultDecision;
    }

    // Find matching rules: exact action + resource + conditions
    const matching = rules.filter(rule => {
      if (rule.action !== request.action || rule.resource !== request.resource) {
        return false;
      }

      // If rule has conditions, all must match request conditions
      if (rule.conditions && Object.keys(rule.conditions).length > 0) {
        if (!request.conditions) {
          return false;
        }
        return Object.entries(rule.conditions).every(
          ([key, value]) => request.conditions![key] === value,
        );
      }

      return true;
    });

    if (matching.length === 0) {
      return this.options.defaultDecision;
    }

    // Deny takes precedence
    if (matching.some(r => r.effect === 'deny')) {
      return AuthorizationDecisions.DENY;
    }

    return matching.some(r => r.effect === 'allow')
      ? AuthorizationDecisions.ALLOW
      : this.options.defaultDecision;
  }

  static reset(): void {
    TestAuthorizationEnforcer.rules = [];
    TestAuthorizationEnforcer.loadRulesFn = undefined;
    TestAuthorizationEnforcer.onBuildRules = undefined;
  }
}

// =============================================================================
// Shared test utilities
// =============================================================================

/**
 * Creates a minimal mock Hono context with get/set/req for middleware testing.
 * Tracks context variables so we can assert on them.
 */
export const createMockContext = (overrides?: {
  user?: (IAuthUser & { principalType?: string }) | undefined;
  isSkipAuthorize?: boolean;
  rules?: unknown;
  path?: string;
}) => {
  const store = new Map<string, unknown>();

  // Pre-populate context variables — inject default principalType for enforcer-based auth
  if (overrides?.user !== undefined) {
    const user = { principalType: 'user', ...overrides.user };
    store.set(Authentication.CURRENT_USER, user);
  }
  if (overrides?.isSkipAuthorize) {
    store.set(Authorization.SKIP_AUTHORIZATION, true);
  }
  if (overrides?.rules !== undefined) {
    store.set(Authorization.RULES, overrides.rules);
  }

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: {
      path: overrides?.path ?? '/test',
    },
    _store: store, // expose for assertions
  };
};

/**
 * Creates a fresh AuthorizationEnforcerRegistry by resetting the singleton.
 * Also resets the TestAuthorizationEnforcer static state.
 */
export const createFreshRegistry = (): AuthorizationEnforcerRegistry => {
  const registry = AuthorizationEnforcerRegistry.getInstance();
  registry.reset();
  TestAuthorizationEnforcer.reset();
  return registry;
};

export type { IAuthorizeOptions, IAuthUser, TAuthorizationDecision };
