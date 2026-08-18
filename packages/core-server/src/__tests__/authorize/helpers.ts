import type { TContext } from '@venizia/ignis-kernel';
import { Authentication } from '@venizia/ignis-kernel';
import type { IAuthUser } from '@venizia/ignis-kernel';
import {
  Authorization,
  AuthorizationDecisions,
  AuthorizeBindingKeys,
  type TAuthorizationDecision,
} from '@venizia/ignis-kernel';
import type {
  IAuthorizationEnforcer,
  IAuthorizationRequest,
  IAuthorizeOptions,
} from '@venizia/ignis-kernel';
import { AuthorizationEnforcerRegistry } from '@venizia/ignis-kernel';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { Env } from 'hono';

export type TTestRule = {
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  conditions?: Record<string, unknown>;
};

/** Bun's transpiler drops parameter decorators, so @inject is a no-op at test time - metadata is registered explicitly instead. */
export class TestAuthorizationEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<Env, string, string, TTestRule[]>
{
  name = 'test';

  static rules: TTestRule[] = [];
  static loadRulesFn?: (opts: { user: IAuthUser; context: TContext }) => Promise<TTestRule[]>;
  static onBuildRules?: () => void;

  private options: IAuthorizeOptions;

  constructor(options: IAuthorizeOptions) {
    super({ scope: TestAuthorizationEnforcer.name });
    this.options = options;
  }

  configure(): void {}

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

    const matching = rules.filter(rule => {
      if (rule.action !== request.action || rule.resource !== request.resource) {
        return false;
      }

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

export const createMockContext = (overrides?: {
  user?: (IAuthUser & { principalType?: string }) | undefined;
  isSkipAuthorize?: boolean;
  rules?: unknown;
  path?: string;
}) => {
  const store = new Map<string, unknown>();

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
    _store: store,
  };
};

/** Registers @inject metadata for TestAuthorizationEnforcer by hand - Bun's transpiler drops parameter decorators. */
const registerTestEnforcerInjectMetadata = () => {
  MetadataRegistry.getInstance().setInjectMetadata({
    target: TestAuthorizationEnforcer,
    index: 0,
    metadata: {
      key: AuthorizeBindingKeys.OPTIONS,
      index: 0,
      isOptional: false,
    },
  });
};

// Register once at module load time (equivalent to what @inject would do)
registerTestEnforcerInjectMetadata();

export const createFreshRegistry = (): AuthorizationEnforcerRegistry => {
  const registry = AuthorizationEnforcerRegistry.getInstance();
  registry.reset();
  TestAuthorizationEnforcer.reset();
  // Re-register inject metadata in case clearAll was called
  registerTestEnforcerInjectMetadata();
  return registry;
};

export type { IAuthorizeOptions, IAuthUser, TAuthorizationDecision };
