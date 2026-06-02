import { describe, test, expect } from 'bun:test';
import {
  CasbinAuthorizationEnforcer,
  CasbinDomainMatchingFunctions,
  CasbinEnforcerModelDrivers,
  type ICasbinEnforcerOptions,
} from '@/components/auth/authorize';

// Canonical "RBAC with domains" model (spec §2): domain scoping lives on the membership relation
// `g` (3-arg, domain-aware); role permissions are domain-agnostic (`p.dom = "*"`). A request domain
// matches a stored `g` domain via the registered domain matching function; `keyMatch(r.dom, p.dom)`
// covers the (always-`*`) policy domain.
const MODEL = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && keyMatch(r.dom, p.dom) && r.obj == p.obj && r.act == p.act
`;

// Run the full request path (configure → buildRules → evaluate) on a pooled enforcer wired with a
// fixed-line adapter + a domain-from-request normalizePayloadFn. The pool model has no shared casbin
// enforcer to poke directly, so we exercise behavior through the public API.
const enforceWithDomain = async (opts: {
  domainMatching?: ICasbinEnforcerOptions['domainMatching'];
  lines: string[];
  requestDomain?: string;
  resource: string;
  action: string;
}): Promise<string> => {
  const options: ICasbinEnforcerOptions = {
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
    cached: { use: false },
    adapter: {
      isFiltered: () => true,
      loadPolicy: async () => {},
      loadFilteredPolicy: async (model: import('casbin').Model) => {
        const { Helper } = await import('casbin');
        opts.lines.forEach(line => Helper.loadPolicyLine(line, model));
      },
      savePolicy: async () => true,
      addPolicy: async () => {},
      removePolicy: async () => {},
      removeFilteredPolicy: async () => {},
    } as unknown as import('casbin').Adapter,
    domainMatching: opts.domainMatching,
    normalizePayloadFn: ({ user, resource, action }) => ({
      subject: `User_${user.userId}`,
      domain: opts.requestDomain,
      resource,
      action,
    }),
  };

  const enforcer = new CasbinAuthorizationEnforcer(options);
  await enforcer.configure();

  const user = { userId: 'u', principalType: 'User', roles: [] } as never;
  const ctx = {} as never;
  const rules = await enforcer.buildRules({ user, context: ctx });
  return enforcer.evaluate({
    rules,
    request: { action: opts.action, resource: opts.resource },
    context: ctx,
  });
};

describe('CasbinAuthorizationEnforcer - domain matching function', () => {
  test('wildcard `g, user, role, *` matches ANY request domain when keyMatch is registered', async () => {
    const lines = ['g, User_u, Role_r, *', 'p, Role_r, *, Material.find, read, allow'];
    const dm: ICasbinEnforcerOptions['domainMatching'] = {
      roleDefinition: 'g',
      fn: CasbinDomainMatchingFunctions.KEY_MATCH,
    };

    expect(
      await enforceWithDomain({
        domainMatching: dm,
        lines,
        requestDomain: 'Merchant_anything',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('allow');
    expect(
      await enforceWithDomain({
        domainMatching: dm,
        lines,
        requestDomain: 'Merchant_other',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('allow');
  });

  test('scoped `g, user, role, Merchant_X` stays isolated to that merchant', async () => {
    const lines = ['g, User_u, Role_r, Merchant_X', 'p, Role_r, *, Material.find, read, allow'];
    const dm: ICasbinEnforcerOptions['domainMatching'] = {
      roleDefinition: 'g',
      fn: CasbinDomainMatchingFunctions.KEY_MATCH,
    };

    expect(
      await enforceWithDomain({
        domainMatching: dm,
        lines,
        requestDomain: 'Merchant_X',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('allow');
    expect(
      await enforceWithDomain({
        domainMatching: dm,
        lines,
        requestDomain: 'Merchant_Y',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('deny');
  });

  test('backward-compatible: without domainMatching, `*` is a literal domain (no wildcard)', async () => {
    const lines = ['g, User_u, Role_r, *', 'p, Role_r, *, Material.find, read, allow'];

    // Without a domain matching function the `g` domain is compared exactly, so a stored `*`
    // does NOT match a real request domain — proving behavior is unchanged when unset.
    expect(
      await enforceWithDomain({
        lines,
        requestDomain: 'Merchant_anything',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('deny');
    // It still matches a request whose domain is literally "*".
    expect(
      await enforceWithDomain({
        lines,
        requestDomain: '*',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('allow');
  });

  test('matching function survives a clearPolicy + reload + buildRoleLinks cycle (cache reload path)', async () => {
    // The matcher func is registered once per pooled enforcer at create(); every request reloads the
    // model (clearPolicy + loadPolicyLine + buildRoleLinks) inside pool.use, so this exercises exactly
    // that reload cycle. The func must still be in effect after the reload.
    const lines = ['g, User_u, Role_r, *', 'p, Role_r, *, Material.find, read, allow'];
    expect(
      await enforceWithDomain({
        domainMatching: { roleDefinition: 'g', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
        lines,
        requestDomain: 'Merchant_anything',
        resource: 'Material.find',
        action: 'read',
      }),
    ).toBe('allow');
  });

  test('throws on an unsupported domain matching func', async () => {
    const options: ICasbinEnforcerOptions = {
      model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
      cached: { use: false },
      // @ts-expect-error — intentionally invalid to assert validation
      domainMatching: { roleDefinition: 'g', fn: 'bogusMatch' },
    };
    const enforcer = new CasbinAuthorizationEnforcer(options);

    let error: unknown;
    try {
      await enforcer.configure();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(String((error as Error)?.message)).toContain('Unsupported func');
  });

  test('throws when the roleDefinition is not declared in the model (no silent no-op)', async () => {
    const options: ICasbinEnforcerOptions = {
      model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL }, // declares `g`, not `g2`
      cached: { use: false },
      domainMatching: { roleDefinition: 'g2', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
    };
    const enforcer = new CasbinAuthorizationEnforcer(options);

    let error: unknown;
    try {
      await enforcer.configure();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(String((error as Error)?.message)).toContain('is not declared in the Casbin model');
  });

  // ── End-to-end through the real request path ──────────────────────────────────────────────────
  // configure() (registers keyMatch) → buildRules() → loadFilteredPolicy() (clears + reloads +
  // buildRoleLinks) → evaluate() → enforceSync(sub, dom, obj, act). This proves the registered
  // domain matching function SURVIVES the per-request loadFilteredPolicy reload (it is NOT wiped by
  // initRmMap, which only runs at construction) — i.e. the wildcard works in production, not just
  // when policies are added directly to the model.

  // Minimal casbin FilteredAdapter that replays a fixed set of policy lines (per the model in §2).
  const makeFilteredAdapter = (lines: string[]) => ({
    isFiltered: () => true,
    loadPolicy: async () => {},
    loadFilteredPolicy: async (model: import('casbin').Model) => {
      const { Helper } = await import('casbin');
      lines.forEach(line => Helper.loadPolicyLine(line, model));
    },
    savePolicy: async () => true,
    addPolicy: async () => {},
    removePolicy: async () => {},
    removeFilteredPolicy: async () => {},
  });

  // Build an enforcer wired with a filtered adapter + a domain-from-context normalizePayloadFn, run
  // the real buildRules → evaluate path, and return the decision for a given request domain.
  const enforceViaRequestPath = async (opts: {
    lines: string[];
    requestDomain?: string;
    resource: string;
    action: string;
  }) => {
    const options: ICasbinEnforcerOptions = {
      model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
      cached: { use: false },
      adapter: makeFilteredAdapter(opts.lines) as unknown as import('casbin').Adapter,
      domainMatching: { roleDefinition: 'g', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
      normalizePayloadFn: ({ user, resource, action }) => ({
        subject: `User_${user.userId}`,
        domain: opts.requestDomain,
        resource,
        action,
      }),
    };
    const enforcer = new CasbinAuthorizationEnforcer(options);
    await enforcer.configure();

    const user = { userId: 'u', principalType: 'User', roles: [] } as never;
    const ctx = {} as never;

    const rules = await enforcer.buildRules({ user, context: ctx });
    return enforcer.evaluate({
      rules,
      request: { action: opts.action, resource: opts.resource },
      context: ctx,
    });
  };

  test('e2e: owner is allowed at an owned merchant and DENIED at a non-owned merchant', async () => {
    // Owner holds Role_owner in Merchant_A and Merchant_B; perm is domain-agnostic (`*`).
    const lines = [
      'g, User_u, Role_owner, Merchant_A',
      'g, User_u, Role_owner, Merchant_B',
      'p, Role_owner, *, Material.find, read, allow',
    ];

    const allowedAtA = await enforceViaRequestPath({
      lines,
      requestDomain: 'Merchant_A',
      resource: 'Material.find',
      action: 'read',
    });
    const deniedAtC = await enforceViaRequestPath({
      lines,
      requestDomain: 'Merchant_C', // not owned
      resource: 'Material.find',
      action: 'read',
    });

    expect(allowedAtA).toBe('allow');
    expect(deniedAtC).toBe('deny');
  });

  test('e2e: global role (`g, user, role, *`) is allowed at ANY request domain', async () => {
    const lines = [
      'g, User_u, Role_guest, *',
      'p, Role_guest, *, Organizer.onBoarding, create, allow',
    ];

    const allowedAtPlaceholder = await enforceViaRequestPath({
      lines,
      requestDomain: 'Merchant_00000000-0000-0000-0000-000000000000',
      resource: 'Organizer.onBoarding',
      action: 'create',
    });
    const allowedElsewhere = await enforceViaRequestPath({
      lines,
      requestDomain: 'Merchant_anything',
      resource: 'Organizer.onBoarding',
      action: 'create',
    });

    expect(allowedAtPlaceholder).toBe('allow');
    expect(allowedElsewhere).toBe('allow');
  });

  // ── Shared-model concurrency race — FIXED by the pooled-enforcer rewrite (Plan 2) ─────────────
  // Previously the enforcer was a shared singleton whose model was REPLACED per request, so a second
  // request's buildRules between request A's buildRules and A's evaluate corrupted A's decision.
  // Now buildRules returns a {user, lines} SNAPSHOT and evaluate loads those exact lines into its own
  // pooled enforcer atomically — so an interleaved buildRules for another user CANNOT affect A.

  // Filtered adapter returning a different policy set per user (keyed by filter.principal.id).
  const makeMultiUserAdapter = (linesByUser: Record<string, string[]>) => ({
    isFiltered: () => true,
    loadPolicy: async () => {},
    loadFilteredPolicy: async (
      model: import('casbin').Model,
      filter: { principal: { id: string | number } },
    ) => {
      const { Helper } = await import('casbin');
      (linesByUser[String(filter.principal.id)] ?? []).forEach(line =>
        Helper.loadPolicyLine(line, model),
      );
    },
    savePolicy: async () => true,
    addPolicy: async () => {},
    removePolicy: async () => {},
    removeFilteredPolicy: async () => {},
  });

  test('pool isolation: a concurrent buildRules for another user does NOT corrupt the first user decision', async () => {
    const domainByUser: Record<string, string> = { a: 'Merchant_A', b: 'Merchant_B' };
    const options: ICasbinEnforcerOptions = {
      model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
      cached: { use: false },
      adapter: makeMultiUserAdapter({
        a: ['g, User_a, Role_owner, Merchant_A', 'p, Role_owner, *, Material.find, read, allow'],
        b: ['g, User_b, Role_other, Merchant_B', 'p, Role_other, *, Other.find, read, allow'],
      }) as unknown as import('casbin').Adapter,
      domainMatching: { roleDefinition: 'g', fn: CasbinDomainMatchingFunctions.KEY_MATCH },
      normalizePayloadFn: ({ user, resource, action }) => ({
        subject: `User_${user.userId}`,
        domain: domainByUser[String(user.userId)],
        resource,
        action,
      }),
    };
    const enforcer = new CasbinAuthorizationEnforcer(options);
    await enforcer.configure();

    const userA = { userId: 'a', principalType: 'User', roles: [] } as never;
    const userB = { userId: 'b', principalType: 'User', roles: [] } as never;
    const ctx = {} as never;

    // Request A builds its rules → captures A's policy lines as a snapshot.
    const rulesA = await enforcer.buildRules({ user: userA, context: ctx });

    // A concurrent request B completes its buildRules before A evaluates. With the pooled-enforcer
    // model this cannot touch A's snapshot or A's per-request enforcer.
    await enforcer.buildRules({ user: userB, context: ctx });

    // A finally evaluates against its OWN snapshot on its own pooled enforcer. A legitimately has
    // Material.find at Merchant_A, so the correct answer is 'allow' — and the race is gone.
    const decisionA = await enforcer.evaluate({
      rules: rulesA,
      request: { action: 'read', resource: 'Material.find' },
      context: ctx,
    });

    expect(decisionA).toBe('allow');
  });
});
