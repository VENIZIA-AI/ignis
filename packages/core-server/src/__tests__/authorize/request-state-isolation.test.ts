import { describe, test, expect } from 'bun:test';
import {
  Authentication,
  Authorization,
  AuthorizationDecisions,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  Container,
  authorize,
} from '@venizia/ignis-kernel';
import type {
  IAuthUser,
  IAuthorizationEnforcer,
  IAuthorizationRequest,
  IAuthorizeOptions,
  TAuthorizationDecision,
  TContext,
} from '@venizia/ignis-kernel';
import { AuthorizationEnforcerRegistry, MetadataRegistry } from '@venizia/ignis-kernel';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { Env } from 'hono';

/**
 * One Hono context carries one middleware PER SPEC, so everything a spec writes there is visible to
 * the next one. Three fixes depend on that not leaking, and all three would still pass the rest of
 * the authorize suite if they were reverted - nothing else registers two enforcers on one request,
 * or resolves one enforcer concurrently.
 */

/** Records what each enforcer was actually asked, so a leak shows up as the WRONG input, not a decision. */
interface IRecordingEnforcerState {
  buildRulesCalls: number;
  configureCalls: number;
  seenDomains: Array<string | undefined>;
  seenRules: Array<unknown>;
}

const createRecordingEnforcer = (opts: {
  name: string;
  decision: TAuthorizationDecision;
  configureDelayMs?: number;
}) => {
  const state: IRecordingEnforcerState = {
    buildRulesCalls: 0,
    configureCalls: 0,
    seenDomains: [],
    seenRules: [],
  };

  class RecordingEnforcer
    extends BaseHelper
    implements IAuthorizationEnforcer<Env, AnyType, AnyType, AnyType>
  {
    name = opts.name;

    constructor(_options: IAuthorizeOptions) {
      super({ scope: `RecordingEnforcer:${opts.name}` });
    }

    /**
     * Asynchronous on purpose: the real one dynamic-imports casbin, and the registry bug being
     * pinned lived entirely in the window that await opens.
     */
    async configure(): Promise<void> {
      state.configureCalls += 1;
      await new Promise(resolve => setTimeout(resolve, opts.configureDelayMs ?? 5));
    }

    async buildRules(): Promise<AnyType> {
      state.buildRulesCalls += 1;
      // A rule set that names its owner, so borrowing another enforcer's is visible.
      return { ownedBy: opts.name };
    }

    async evaluate(evaluateOpts: {
      rules: AnyType;
      request: IAuthorizationRequest;
      context: TContext;
    }): Promise<TAuthorizationDecision> {
      state.seenDomains.push(evaluateOpts.request.domain);
      state.seenRules.push(evaluateOpts.rules);
      return opts.decision;
    }
  }

  // Bun's transpiler drops parameter decorators, so `@inject` is registered by hand.
  MetadataRegistry.getInstance().setInjectMetadata({
    target: RecordingEnforcer,
    index: 0,
    metadata: { key: AuthorizeBindingKeys.OPTIONS, index: 0, isOptional: false },
  });

  return { RecordingEnforcer, state };
};

const createContext = (user: IAuthUser & { principalType?: string }) => {
  const store = new Map<string, unknown>();
  store.set(Authentication.CURRENT_USER, { principalType: 'user', ...user });

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: {
      path: '/test',
      param: () => undefined,
      header: () => undefined,
      query: () => undefined,
    },
    _store: store,
  };
};

const run = async (middleware: AnyType, context: AnyType): Promise<{ error?: unknown }> => {
  try {
    await middleware(context, async () => {});
    return {};
  } catch (error) {
    return { error };
  }
};

describe('per-request authorization state is not shared across specs', () => {
  /**
   * The escalation this closes: the rule slot held ONE anonymous rule set for the whole request, so
   * a second `authorize()` naming a different enforcer evaluated against the first enforcer's rules
   * - granting where its own policy set denies. Nothing could detect it, because the cached value
   * carried no ownership.
   */
  test('a second enforcer builds its own rules instead of inheriting the first', async () => {
    const registry = AuthorizationEnforcerRegistry.getInstance();
    registry.reset();

    const container = new Container({ scope: 'rules-isolation' });
    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue({ defaultDecision: AuthorizationDecisions.DENY });

    const permissive = createRecordingEnforcer({
      name: 'permissive',
      decision: AuthorizationDecisions.ALLOW,
    });
    const strict = createRecordingEnforcer({
      name: 'strict',
      decision: AuthorizationDecisions.DENY,
    });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: permissive.RecordingEnforcer,
          name: 'permissive',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
        {
          enforcer: strict.RecordingEnforcer,
          name: 'strict',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    const context = createContext({ id: 1, userId: 1 } as AnyType);

    const first = authorize({
      spec: { action: 'read', resource: 'User' },
      enforcerName: 'permissive',
    });
    const second = authorize({
      spec: { action: 'read', resource: 'User' },
      enforcerName: 'strict',
    });

    expect((await run(first, context)).error).toBeUndefined();
    const secondResult = await run(second, context);

    // Each enforcer built its OWN rules - the second did not reuse the cached slot.
    expect(permissive.state.buildRulesCalls).toBe(1);
    expect(strict.state.buildRulesCalls).toBe(1);
    expect(strict.state.seenRules[0]).toEqual({ ownedBy: 'strict' });

    // And its own policy decided: strict denies where permissive allowed.
    expect(secondResult.error).toBeDefined();

    // The slot is a Map keyed by enforcer, holding both.
    const cached = context.get(Authorization.RULES) as Map<string, unknown>;
    expect(cached).toBeInstanceOf(Map);
    expect([...cached.keys()].sort()).toEqual(['permissive', 'strict']);
  });

  /**
   * The widening this closes: the decision read `Authorization.DOMAIN` back off the context, so a
   * domain-less spec inherited the tenant domain a PREVIOUS spec had written, and a check that
   * should have run SYSTEM_WIDE ran scoped to that tenant instead.
   */
  test("a domain-less spec does not inherit the previous spec's domain", async () => {
    const registry = AuthorizationEnforcerRegistry.getInstance();
    registry.reset();

    const container = new Container({ scope: 'domain-isolation' });
    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue({ defaultDecision: AuthorizationDecisions.ALLOW });

    const enforcer = createRecordingEnforcer({
      name: 'domain',
      decision: AuthorizationDecisions.ALLOW,
    });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: enforcer.RecordingEnforcer,
          name: 'domain',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    const context = createContext({ id: 1, userId: 1 } as AnyType);

    const scoped = authorize({
      spec: {
        action: 'read',
        resource: 'User',
        domain: () => ({ type: 'Merchant', id: 7 }),
      },
      enforcerName: 'domain',
    });
    const systemWide = authorize({
      spec: { action: 'read', resource: 'Report' },
      enforcerName: 'domain',
    });

    await run(scoped, context);
    await run(systemWide, context);

    expect(enforcer.state.seenDomains).toHaveLength(2);
    expect(enforcer.state.seenDomains[0]).toBe('Merchant_7');
    expect(enforcer.state.seenDomains[1]).toBeUndefined();
  });
});

describe('AuthorizationEnforcerRegistry warms an enforcer once', () => {
  /**
   * `configure()` yields, and the "already configured" flag was only set after the await - so a
   * burst of first requests each saw an unconfigured enforcer and each built a full pool. Measured
   * before the fix: 40 concurrent first requests produced 40 `configure()` calls.
   */
  test('concurrent first requests share one configure() instead of racing', async () => {
    const registry = AuthorizationEnforcerRegistry.getInstance();
    registry.reset();

    const container = new Container({ scope: 'warmup' });
    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue({ defaultDecision: AuthorizationDecisions.DENY });

    const slow = createRecordingEnforcer({
      name: 'slow',
      decision: AuthorizationDecisions.ALLOW,
      configureDelayMs: 20,
    });

    registry.register({
      container,
      enforcers: [
        {
          enforcer: slow.RecordingEnforcer,
          name: 'slow',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });

    await Promise.all(Array.from({ length: 40 }, () => registry.resolveEnforcer({ name: 'slow' })));

    expect(slow.state.configureCalls).toBe(1);

    // A later request reuses the completed flag, not the in-flight entry.
    await registry.resolveEnforcer({ name: 'slow' });
    expect(slow.state.configureCalls).toBe(1);
  });

  /** A failed warmup must not be remembered as "configured", or every later request skips it. */
  test('a failed configure() is retried rather than cached', async () => {
    const registry = AuthorizationEnforcerRegistry.getInstance();
    registry.reset();

    const container = new Container({ scope: 'warmup-failure' });
    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue({ defaultDecision: AuthorizationDecisions.DENY });

    let attempts = 0;

    class FlakyEnforcer
      extends BaseHelper
      implements IAuthorizationEnforcer<Env, AnyType, AnyType, AnyType>
    {
      name = 'flaky';

      constructor(_options: IAuthorizeOptions) {
        super({ scope: 'FlakyEnforcer' });
      }

      async configure(): Promise<void> {
        attempts += 1;
        await new Promise(resolve => setTimeout(resolve, 1));
        if (attempts === 1) {
          throw new Error('warmup failed');
        }
      }

      async buildRules(): Promise<AnyType> {
        return {};
      }

      async evaluate(): Promise<TAuthorizationDecision> {
        return AuthorizationDecisions.ALLOW;
      }
    }

    MetadataRegistry.getInstance().setInjectMetadata({
      target: FlakyEnforcer,
      index: 0,
      metadata: { key: AuthorizeBindingKeys.OPTIONS, index: 0, isOptional: false },
    });

    registry.register({
      container,
      enforcers: [
        { enforcer: FlakyEnforcer, name: 'flaky', type: AuthorizationEnforcerTypes.CUSTOM },
      ],
    });

    let caught: unknown;
    try {
      await registry.resolveEnforcer({ name: 'flaky' });
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).toContain('warmup failed');

    // The second call configures again rather than inheriting a poisoned entry.
    await registry.resolveEnforcer({ name: 'flaky' });
    expect(attempts).toBe(2);
  });
});
