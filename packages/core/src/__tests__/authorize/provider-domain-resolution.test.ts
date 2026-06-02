import { describe, test, expect } from 'bun:test';
import {
  Authorization,
  AuthorizationDecisions,
  AuthorizationDomainScopes,
  AuthorizationEnforcerTypes,
  type TAuthorizationDecision,
} from '@/components/auth/authorize/common/constants';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import { authorize } from '@/components/auth/authorize/middlewares';
import { resolveRequestDomain } from '@/components/auth/authorize/common/resolve-request-domain';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import type {
  IAuthorizeOptions,
  IAuthorizationSpec,
  IAuthorizationRequest,
} from '@/components/auth/authorize/common/types';
import type { IDataSource } from '@/base/datasources';
import { Authentication } from '@/components/auth/authenticate/common/constants';
import type { IAuthUser } from '@/components/auth/authenticate/common/types';
import { Container } from '@/helpers/inversion';
import type { TContext } from '@/base/controllers/common/types';
import { createFreshRegistry, TestAuthorizationEnforcer, type TTestRule } from './helpers';

/**
 * Full-context stub that exposes req.param/header/query (which the helpers' createMockContext
 * does NOT) so the provider's domain-resolution block can read declarative sources. Lets us
 * also seed/omit user.principalType and capture what the enforcer receives.
 */
const createFullContext = (overrides?: {
  user?: (IAuthUser & { principalType?: string }) | undefined;
  rules?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  contextValues?: Record<string, unknown>;
}) => {
  const store = new Map<string, unknown>();

  for (const [k, v] of Object.entries(overrides?.contextValues ?? {})) {
    store.set(k, v);
  }
  if (overrides?.user !== undefined) {
    store.set(Authentication.CURRENT_USER, overrides.user);
  }
  if (overrides?.rules !== undefined) {
    store.set(Authorization.RULES, overrides.rules);
  }

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: {
      path: '/test',
      param: (k: string) => overrides?.params?.[k],
      header: (k: string) => overrides?.headers?.[k],
      query: (k: string) => overrides?.query?.[k],
    },
    _store: store,
  };
};

/** Enforcer that records the request it was evaluated with (to assert domain wiring). */
class CapturingEnforcer extends TestAuthorizationEnforcer {
  static capturedRequest: IAuthorizationRequest | undefined;

  override async evaluate(opts: {
    rules: TTestRule[];
    request: IAuthorizationRequest;
    context: TContext;
  }): Promise<TAuthorizationDecision> {
    CapturingEnforcer.capturedRequest = opts.request;
    return super.evaluate(opts);
  }
}

const setup = (opts: {
  spec: IAuthorizationSpec;
  options?: Partial<IAuthorizeOptions>;
  rules?: TTestRule[];
  enforcer?: typeof TestAuthorizationEnforcer;
}) => {
  const registry = createFreshRegistry();
  const container = new Container({ scope: 'provider-domain-test' });

  CapturingEnforcer.capturedRequest = undefined;
  if (opts.rules) {
    TestAuthorizationEnforcer.rules = opts.rules;
  }

  const authorizeOptions: IAuthorizeOptions = {
    defaultDecision: opts.options?.defaultDecision ?? 'deny',
    alwaysAllowRoles: opts.options?.alwaysAllowRoles,
    domainResolver: opts.options?.domainResolver,
  };
  container
    .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
    .toValue(authorizeOptions);

  registry.register({
    container,
    enforcers: [
      {
        enforcer: (opts.enforcer ?? TestAuthorizationEnforcer) as never,
        name: 'test',
        type: AuthorizationEnforcerTypes.CUSTOM,
      },
    ],
  });

  const middleware = authorize({ spec: opts.spec });
  return { middleware };
};

const run = async (
  middleware: ReturnType<typeof authorize>,
  context: ReturnType<typeof createFullContext>,
): Promise<{ hasCalledNext: boolean; error?: { statusCode?: number; message?: string } }> => {
  let hasCalledNext = false;
  const next = async () => {
    hasCalledNext = true;
  };
  try {
    await (middleware as unknown as (c: unknown, n: () => Promise<void>) => Promise<void>)(
      context,
      next,
    );
    return { hasCalledNext };
  } catch (error) {
    return { hasCalledNext, error: error as { statusCode?: number; message?: string } };
  }
};

describe('AuthorizationProvider — domain resolution block (lines 116-121, 149)', () => {
  test('declarative spec.domain from param → context.DOMAIN set and reaches enforcer', async () => {
    const { middleware } = setup({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'merchantId', type: 'Merchant' },
      },
      rules: [{ action: 'read', resource: 'Order', effect: 'allow' }],
      enforcer: CapturingEnforcer,
    });

    const context = createFullContext({
      user: { userId: 'u1', principalType: 'user' },
      params: { merchantId: '7' },
    });

    const { hasCalledNext, error } = await run(middleware, context);

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
    expect(context._store.get(Authorization.DOMAIN)).toBe('Merchant_7');
    expect(CapturingEnforcer.capturedRequest?.domain).toBe('Merchant_7');
  });

  test('method spec.domain → resolved domain stashed and passed to enforcer', async () => {
    const { middleware } = setup({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: () => ({ type: 'Organizer', id: '3' }),
      },
      rules: [{ action: 'read', resource: 'Order', effect: 'allow' }],
      enforcer: CapturingEnforcer,
    });

    const context = createFullContext({
      user: { userId: 'u1', principalType: 'user' },
    });

    const { hasCalledNext, error } = await run(middleware, context);

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
    expect(context._store.get(Authorization.DOMAIN)).toBe('Organizer_3');
    expect(CapturingEnforcer.capturedRequest?.domain).toBe('Organizer_3');
  });

  test('global options.domainResolver (no spec.domain) → resolved and used', async () => {
    const { middleware } = setup({
      spec: { action: 'read', resource: 'Order' },
      options: { domainResolver: () => ({ type: 'Merchant', id: '9' }) },
      rules: [{ action: 'read', resource: 'Order', effect: 'allow' }],
      enforcer: CapturingEnforcer,
    });

    const context = createFullContext({
      user: { userId: 'u1', principalType: 'user' },
    });

    const { hasCalledNext, error } = await run(middleware, context);

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
    expect(context._store.get(Authorization.DOMAIN)).toBe('Merchant_9');
    expect(CapturingEnforcer.capturedRequest?.domain).toBe('Merchant_9');
  });

  test('no spec.domain and no global resolver → block SKIPPED (DOMAIN unset, legacy path works)', async () => {
    const { middleware } = setup({
      spec: { action: 'read', resource: 'Order' },
      rules: [{ action: 'read', resource: 'Order', effect: 'allow' }],
      enforcer: CapturingEnforcer,
    });

    const context = createFullContext({
      user: { userId: 'u1', principalType: 'user' },
    });

    const { hasCalledNext, error } = await run(middleware, context);

    expect(error).toBeUndefined();
    expect(hasCalledNext).toBe(true);
    // Block skipped → DOMAIN never set; enforcer sees undefined domain (legacy behavior).
    expect(context._store.get(Authorization.DOMAIN)).toBeUndefined();
    expect(CapturingEnforcer.capturedRequest?.domain).toBeUndefined();
  });

  test('declarative spec.domain with missing param → SYSTEM_WIDE reaches enforcer', async () => {
    const { middleware } = setup({
      spec: {
        action: 'read',
        resource: 'Order',
        domain: { from: 'param', key: 'merchantId', type: 'Merchant' },
      },
      rules: [{ action: 'read', resource: 'Order', effect: 'allow' }],
      enforcer: CapturingEnforcer,
    });

    const context = createFullContext({
      user: { userId: 'u1', principalType: 'user' },
    });

    const { error } = await run(middleware, context);

    expect(error).toBeUndefined();
    expect(context._store.get(Authorization.DOMAIN)).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
    expect(CapturingEnforcer.capturedRequest?.domain).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
  });
});

describe('AuthorizationProvider — principalType guard (lines 128-132)', () => {
  test('throws 400 when user has no principalType and rules must be built', async () => {
    const { middleware } = setup({
      spec: { action: 'read', resource: 'Order' },
      rules: [{ action: 'read', resource: 'Order', effect: 'allow' }],
    });

    // user WITHOUT principalType, and no cached rules → enforcer.buildRules path is reached.
    const context = createFullContext({
      user: { userId: 'u1' },
    });

    const { hasCalledNext, error } = await run(middleware, context);

    expect(hasCalledNext).toBe(false);
    expect(error).toBeDefined();
    expect(error?.statusCode).toBe(400);
    expect(error?.message).toContain('principalType is required');
  });
});

describe('AuthorizationProvider — ABSTAIN → defaultDecision (line 155)', () => {
  test('enforcer ABSTAIN resolves to defaultDecision=deny → 403', async () => {
    // No rules → TestAuthorizationEnforcer.evaluate returns options.defaultDecision.
    // Set defaultDecision to ABSTAIN so evaluate returns ABSTAIN, exercising line 155.
    const { middleware } = setup({
      spec: { action: 'read', resource: 'Order' },
      options: { defaultDecision: AuthorizationDecisions.ABSTAIN },
      rules: [],
    });

    const context = createFullContext({
      user: { userId: 'u1', principalType: 'user' },
    });

    const { hasCalledNext, error } = await run(middleware, context);

    expect(hasCalledNext).toBe(false);
    expect(error).toBeDefined();
    expect(error?.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Micro coverage-fill cases for sibling files.
// ---------------------------------------------------------------------------

describe('resolveRequestDomain — unknown `from` hits default branch (lines 27-28)', () => {
  test('unrecognized declarative `from` → null → SYSTEM_WIDE', async () => {
    const dom = await resolveRequestDomain({
      spec: {
        action: 'read',
        resource: 'Order',
        // `from` outside the known union exercises the switch default.
        domain: { from: 'cookie' as never, key: 'merchantId', type: 'Merchant' },
      },
      context: {
        req: {
          param: () => undefined,
          header: () => undefined,
          query: () => undefined,
        },
        get: () => undefined,
      } as never,
      options: undefined,
    });
    expect(dom).toBe(AuthorizationDomainScopes.SYSTEM_WIDE);
  });
});

describe('ScopedCasbinAdapter — no-op write methods (lines 43-48)', () => {
  test('loadPolicy/savePolicy/addPolicy/removePolicy/removeFilteredPolicy are no-ops', async () => {
    const dataSource = {
      connector: { execute: async () => ({ rows: [] }) },
    } as unknown as IDataSource;
    const adapter = new ScopedCasbinAdapter({
      dataSource,
      entities: {
        policyDefinition: { tableName: 'PolicyDefinition' },
        permission: { tableName: 'Permission' },
        principals: { user: 'User', role: 'Role' },
        domainTypes: ['Merchant'],
      },
    });

    expect(await adapter.loadPolicy()).toBeUndefined();
    expect(await adapter.savePolicy()).toBe(true);
    expect(await adapter.addPolicy()).toBeUndefined();
    expect(await adapter.removePolicy()).toBeUndefined();
    expect(await adapter.removeFilteredPolicy()).toBeUndefined();
  });
});
