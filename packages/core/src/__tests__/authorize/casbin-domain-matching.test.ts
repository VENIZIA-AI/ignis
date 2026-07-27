import { describe, test, expect } from 'bun:test';
import type { TContext } from '@/base/controllers/common/types';
import {
  CasbinAuthorizationEnforcer,
  CasbinDomainMatchingFunctions,
  CasbinEnforcerModelDrivers,
  type ICasbinEnforcerOptions,
} from '@/components/auth/authorize';
import type { FilteredAdapter, Model } from 'casbin';

// Canonical "RBAC with domains" model: domain scoping lives on the 3-arg `g` membership, role permissions are domain-agnostic (`p.dom = "*"` via keyMatch), and `g` domains match via the registered domain matching function.
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

// No test here exercises a context-dependent normalizer/domain resolver, so an empty stub stands in for the Hono-backed TContext buildRules/evaluate require.
const fakeContext = {} as TContext;

// Runs the full request path on a pooled enforcer: the pool model has no shared casbin enforcer to poke directly, so behavior is exercised through the public API.
const enforceWithDomain = async (opts: {
  domainMatching?: ICasbinEnforcerOptions['domainMatching'];
  lines: string[];
  requestDomain?: string;
  resource: string;
  action: string;
}): Promise<string> => {
  const adapter: FilteredAdapter = {
    isFiltered: () => true,
    loadPolicy: async () => {},
    loadFilteredPolicy: async (model: Model) => {
      const { Helper } = await import('casbin');
      opts.lines.forEach(line => Helper.loadPolicyLine(line, model));
    },
    savePolicy: async () => true,
    addPolicy: async () => {},
    removePolicy: async () => {},
    removeFilteredPolicy: async () => {},
  };

  const options: ICasbinEnforcerOptions = {
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
    cached: { use: false },
    adapter,
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

  const user = { userId: 'u', principalType: 'User', roles: [] };
  const rules = await enforcer.buildRules({ user, context: fakeContext });
  return enforcer.evaluate({
    rules,
    request: { action: opts.action, resource: opts.resource },
    context: fakeContext,
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

    // Without a domain matching function the `g` domain is compared exactly, so a stored `*` does NOT match a real request domain - behavior is unchanged when unset.
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
    // The matcher func is registered once per pooled enforcer at create(), but every request reloads the model inside pool.use, so it must still be in effect after that reload.
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

  // End-to-end through the real request path: proves the registered domain matching function SURVIVES the per-request loadFilteredPolicy reload, since initRmMap only runs at construction.

  // Minimal casbin FilteredAdapter that replays a fixed set of policy lines (per the model in §2).
  const makeFilteredAdapter = (lines: string[]): FilteredAdapter => ({
    isFiltered: () => true,
    loadPolicy: async () => {},
    loadFilteredPolicy: async (model: Model) => {
      const { Helper } = await import('casbin');
      lines.forEach(line => Helper.loadPolicyLine(line, model));
    },
    savePolicy: async () => true,
    addPolicy: async () => {},
    removePolicy: async () => {},
    removeFilteredPolicy: async () => {},
  });

  // Runs the real buildRules -> evaluate path on a filtered adapter plus a domain-from-context normalizePayloadFn and returns the decision for a given request domain.
  const enforceViaRequestPath = async (opts: {
    lines: string[];
    requestDomain?: string;
    resource: string;
    action: string;
  }) => {
    const options: ICasbinEnforcerOptions = {
      model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: MODEL },
      cached: { use: false },
      adapter: makeFilteredAdapter(opts.lines),
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

    const user = { userId: 'u', principalType: 'User', roles: [] };

    const rules = await enforcer.buildRules({ user, context: fakeContext });
    return enforcer.evaluate({
      rules,
      request: { action: opts.action, resource: opts.resource },
      context: fakeContext,
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

  // Concurrency guarantee: evaluate loads buildRules' own {user, lines} snapshot into its own pooled enforcer, so an interleaved buildRules for another user cannot corrupt this decision.

  // Filtered adapter returning a different policy set per user (keyed by filter.principal.id).
  const makeMultiUserAdapter = (linesByUser: Record<string, string[]>): FilteredAdapter => ({
    isFiltered: () => true,
    loadPolicy: async () => {},
    loadFilteredPolicy: async (model: Model, filter: { principal: { id: string | number } }) => {
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
      }),
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

    const userA = { userId: 'a', principalType: 'User', roles: [] };
    const userB = { userId: 'b', principalType: 'User', roles: [] };

    // Request A builds its rules → captures A's policy lines as a snapshot.
    const rulesA = await enforcer.buildRules({ user: userA, context: fakeContext });

    // Request B completes its buildRules before A evaluates; under the pooled-enforcer model that cannot touch A's snapshot or A's per-request enforcer.
    await enforcer.buildRules({ user: userB, context: fakeContext });

    // A evaluates against its OWN snapshot: A legitimately has Material.find at Merchant_A, so 'allow' is correct and the race is gone.
    const decisionA = await enforcer.evaluate({
      rules: rulesA,
      request: { action: 'read', resource: 'Material.find' },
      context: fakeContext,
    });

    expect(decisionA).toBe('allow');
  });
});
