import { describe, expect, test } from 'bun:test';
import { asTypedContext } from '@venizia/ignis-kernel';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { AuthorizationDomainScopes, CasbinEnforcerModelDrivers } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import type { FilteredAdapter, Model } from 'casbin';
import { expectRejection } from '../rejection.helper';

// Adapter that loads a fixed set of scoped lines for any filter - same shape as scoped-enforce-e2e.test.ts.
class FixedScopedAdapter implements FilteredAdapter {
  constructor(private lines: string[]) {}
  async loadPolicy(): Promise<void> {}
  async loadFilteredPolicy(model: Model): Promise<void> {
    const { Helper } = await import('casbin');
    for (const line of this.lines) {
      Helper.loadPolicyLine(line, model);
    }
  }
  isFiltered(): boolean {
    return true;
  }
  async savePolicy(): Promise<boolean> {
    return true;
  }
  async addPolicy(): Promise<void> {}
  async removePolicy(): Promise<void> {}
  async removeFilteredPolicy(): Promise<void> {}
}

// Two-organizer fixture shared by every test: Merchant_1/Merchant_2 nest under Organizer_A, Merchant_9 under Organizer_B.
const DOMAIN_EDGES: Array<{ child: string; parent: string }> = [
  { child: 'Merchant_1', parent: 'Organizer_A' },
  { child: 'Merchant_2', parent: 'Organizer_A' },
  { child: 'Merchant_9', parent: 'Organizer_B' },
];

const hierarchyEnforcer = (opts: { lines: string[]; withHierarchy: boolean }) =>
  new CasbinAuthorizationEnforcer({
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    adapter: new FixedScopedAdapter(opts.lines),
    isScoped: true,
    ...(opts.withHierarchy ? { domainHierarchy: { load: async () => DOMAIN_EDGES } } : {}),
  });

// For tests that need to control the load() result/timing directly (invalidate, staleness) instead of the fixed DOMAIN_EDGES snapshot.
const hierarchyEnforcerWithCustomLoad = (opts: {
  lines: string[];
  load: () => Promise<Array<{ child: string; parent: string }>>;
  refreshMs?: number;
  maxStaleMs?: number;
}) =>
  new CasbinAuthorizationEnforcer({
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    adapter: new FixedScopedAdapter(opts.lines),
    isScoped: true,
    domainHierarchy: { load: opts.load, refreshMs: opts.refreshMs, maxStaleMs: opts.maxStaleMs },
  });

const decide = async (opts: {
  enforcer: CasbinAuthorizationEnforcer;
  userId: number;
  resource: string;
  action: string;
  domain?: string;
}) => {
  const { enforcer, userId, resource, action, domain } = opts;
  const rules = await enforcer.buildRules({
    user: { principalType: 'User', userId },
    context: asTypedContext({}),
  });
  const request = domain ? { resource, action, domain } : { resource, action };
  return enforcer.evaluate({ rules, request, context: asTypedContext({}) });
};

describe('CasbinAuthorizationEnforcer — domainHierarchy regression guard (option omitted)', () => {
  test('role axis: a role assigned at Organizer_A is denied at Merchant_1 when domainHierarchy is omitted', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: false,
      lines: [
        'g, User_1, Role_v, Organizer_A',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(decision).toBe('deny');
  });

  test('membership axis: a user who joined only Organizer_A is denied an ANY_MEMBER grant at Merchant_1 when domainHierarchy is omitted', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: false,
      lines: [
        'g, User_2, Role_v, *',
        'g2, User_2, Organizer_A',
        'p, Role_v, ANY_MEMBER, Activation, read, allow',
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 2,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(decision).toBe('deny');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy: g axis (role assignment cascades down)', () => {
  test('a role assigned at the parent organizer is allowed at both child merchants', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, Organizer_A',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
    });
    await enforcer.configure();

    const atMerchant1 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    const atMerchant2 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_2',
    });

    expect(atMerchant1).toBe('allow');
    expect(atMerchant2).toBe('allow');
  });

  test('a role assigned at Organizer_A is denied at Merchant_9, which nests under Organizer_B', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, Organizer_A',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_9',
    });
    expect(decision).toBe('deny');
  });

  test('a role assigned at Merchant_1 only stays narrow - it does not widen to sibling Merchant_2 (merchants have no children)', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, Merchant_1',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
    });
    await enforcer.configure();

    const atMerchant1 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    const atMerchant2 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_2',
    });

    expect(atMerchant1).toBe('allow');
    expect(atMerchant2).toBe('deny');
  });

  test('hierarchy direction is strict: a role assigned at Merchant_1 is denied at parent Organizer_A', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, Merchant_1',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Organizer_A',
    });
    expect(decision).toBe('deny');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy: g3 axis (grant domain cascades down)', () => {
  test('a grant carrying domain Organizer_A applies at child Merchant_1', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: ['g, User_1, Role_v, *', 'p, Role_v, Organizer_A, Activation, read, allow'],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(decision).toBe('allow');
  });

  test('a grant carrying domain Merchant_1 applies at Merchant_1 (self-match) but not at sibling Merchant_2', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: ['g, User_1, Role_v, *', 'p, Role_v, Merchant_1, Activation, read, allow'],
    });
    await enforcer.configure();

    const atMerchant1 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    const atMerchant2 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_2',
    });

    expect(atMerchant1).toBe('allow');
    expect(atMerchant2).toBe('deny');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy: g2 axis (membership climbs up)', () => {
  test('joining Organizer_A satisfies an ANY_MEMBER grant at child Merchant_1', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, *',
        'g2, User_1, Organizer_A',
        'p, Role_v, ANY_MEMBER, Activation, read, allow',
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(decision).toBe('allow');
  });

  test('joining Merchant_1 does not satisfy an ANY_MEMBER grant at sibling Merchant_2', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, *',
        'g2, User_1, Merchant_1',
        'p, Role_v, ANY_MEMBER, Activation, read, allow',
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_2',
    });
    expect(decision).toBe('deny');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy: fail-closed defaults and deny-override', () => {
  test('a domain-less request falls back to SYSTEM_WIDE - an ANY_MEMBER grant plus real membership still denies', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, *',
        'g2, User_1, Organizer_A',
        'p, Role_v, ANY_MEMBER, Activation, read, allow',
      ],
    });
    await enforcer.configure();

    // Positive control: the same policy lines DO allow at the real domain the user joined.
    const atMerchant1 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(atMerchant1).toBe('allow');

    // No request.domain -> evaluate() defaults to SYSTEM_WIDE, which only a SYSTEM_WIDE grant satisfies.
    const withNoDomain = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
    });
    expect(withNoDomain).toBe('deny');
  });

  test('an explicit deny at Merchant_1 overrides an allow at parent Organizer_A, and does not leak to sibling Merchant_2', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, *',
        'p, Role_v, Organizer_A, Activation, read, allow',
        'p, Role_v, Merchant_1, Activation, read, deny',
      ],
    });
    await enforcer.configure();

    const atMerchant1 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    const atMerchant2 = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_2',
    });

    expect(atMerchant1).toBe('deny');
    expect(atMerchant2).toBe('allow');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy WIDENING (intentional, audit before enabling)', () => {
  // Same policy lines in both tests: a wildcard-domain role assignment (`g, User, Role, *`, what the
  // adapter emits for a domain-less role grant) plus membership joined at the parent organizer. Enabling
  // domainHierarchy turns the previously-scoped-to-Organizer_A membership into access at every child
  // merchant too - this is the widening surfaced in review, so it must be audited before an operator
  // turns the option on for an existing policy set.
  const widenedLines = [
    'g, User_1, Role_v, *',
    'g2, User_1, Organizer_A',
    'p, Role_v, ANY_MEMBER, Activation, read, allow',
  ];

  test("domainHierarchy=off: wildcard-domain role + parent-domain membership is denied at child Merchant_1 (today's behavior)", async () => {
    const enforcer = hierarchyEnforcer({ withHierarchy: false, lines: widenedLines });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(decision).toBe('deny');
  });

  test('domainHierarchy=on: the SAME wildcard-domain role + parent-domain membership is now allowed at child Merchant_1 - audit before enabling', async () => {
    const enforcer = hierarchyEnforcer({ withHierarchy: true, lines: widenedLines });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_1',
    });
    expect(decision).toBe('allow');
  });
});

describe('CasbinAuthorizationEnforcer — invalidateDomainHierarchy()', () => {
  test('a newly added edge is invisible until invalidateDomainHierarchy(), then takes effect immediately without waiting for refreshMs', async () => {
    const mutableEdges: Array<{ child: string; parent: string }> = [];
    const enforcer = hierarchyEnforcerWithCustomLoad({
      lines: [
        'g, User_1, Role_v, Organizer_A',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
      load: async () => mutableEdges,
    });
    await enforcer.configure();

    const beforeEdge = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_10',
    });
    expect(beforeEdge).toBe('deny');

    mutableEdges.push({ child: 'Merchant_10', parent: 'Organizer_A' });
    const reloaded = await enforcer.invalidateDomainHierarchy();
    expect(reloaded).toEqual({ nodeCount: 2, edgeCount: 1 });

    const afterEdge = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_10',
    });
    expect(afterEdge).toBe('allow');
  });

  test('invalidateDomainHierarchy() throws on an enforcer configured without domainHierarchy', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: false,
      lines: [
        'g, User_1, Role_v, *',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
    });
    await enforcer.configure();

    await expectRejection({
      task: enforcer.invalidateDomainHierarchy(),
      message: 'options.domainHierarchy is not enabled',
    });
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy maxStaleMs degradation', () => {
  test('past maxStaleMs with no successful reload: hierarchy-derived access stops, direct-domain access keeps working, and neither request throws', async () => {
    let loadCount = 0;
    const load = async () => {
      loadCount += 1;
      if (loadCount === 1) {
        return DOMAIN_EDGES;
      }
      // Simulates the source (DB) going down right after warmup - every subsequent reload attempt fails.
      throw getError({ message: 'simulated domain hierarchy source outage' });
    };

    const enforcer = hierarchyEnforcerWithCustomLoad({
      lines: [
        // Hierarchy-derived: assigned at the parent, only reachable through the shared graph.
        'g, User_1, Role_v, Organizer_A',
        `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
        // Directly-assigned: assigned at the exact request domain, a self-match that never touches the graph.
        'g, User_2, Role_w, Merchant_1',
        `p, Role_w, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`,
      ],
      load,
      refreshMs: 5,
      maxStaleMs: 20,
    });
    await enforcer.configure();

    // Age the snapshot past maxStaleMs; loadCount is already 1, so every reload from here on fails.
    await new Promise(resolve => setTimeout(resolve, 60));

    let thrown = false;
    let hierarchyDerivedDecision: string | undefined;
    let directlyAssignedDecision: string | undefined;
    try {
      hierarchyDerivedDecision = await decide({
        enforcer,
        userId: 1,
        resource: 'Activation',
        action: 'read',
        domain: 'Merchant_1',
      });
      directlyAssignedDecision = await decide({
        enforcer,
        userId: 2,
        resource: 'Activation',
        action: 'read',
        domain: 'Merchant_1',
      });
    } catch {
      thrown = true;
    }

    expect(thrown).toBe(false);
    expect(hierarchyDerivedDecision).toBe('deny');
    expect(directlyAssignedDecision).toBe('allow');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy shared overlay (g3 <-> g freshness path)', () => {
  test('a g3 policy line for an edge the shared tree does not know yet also satisfies the role (g) axis - a just-created child domain is reachable as soon as the policy cache carries it, without waiting for the shared tree TTL', async () => {
    const roleAssignedAtParent = 'g, User_1, Role_v, Organizer_A';
    const systemWideGrant = `p, Role_v, ${AuthorizationDomainScopes.SYSTEM_WIDE}, Activation, read, allow`;

    // Control: the shared tree has no Merchant_new node at all, so without the g3 line the role axis denies.
    const withoutFreshEdge = hierarchyEnforcer({
      withHierarchy: true,
      lines: [roleAssignedAtParent, systemWideGrant],
    });
    await withoutFreshEdge.configure();
    const control = await decide({
      enforcer: withoutFreshEdge,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_new',
    });
    expect(control).toBe('deny');

    // Same shared tree (still unaware of Merchant_new), but the user's own policy lines now carry
    // a fresh g3 edge - this is what a cache-miss reload would fetch right after the domain is created.
    const withFreshEdge = hierarchyEnforcer({
      withHierarchy: true,
      lines: [roleAssignedAtParent, systemWideGrant, 'g3, Merchant_new, Organizer_A'],
    });
    await withFreshEdge.configure();
    const decision = await decide({
      enforcer: withFreshEdge,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_new',
    });
    expect(decision).toBe('allow');
  });
});

describe('CasbinAuthorizationEnforcer — domainHierarchy shared overlay (g2 <-> g3 freshness path, parent-only membership)', () => {
  test('a user joined only at the parent organizer - no merchant-level membership row - is allowed at a just-created child merchant carried only by a fresh g3 policy line', async () => {
    const enforcer = hierarchyEnforcer({
      withHierarchy: true,
      lines: [
        'g, User_1, Role_v, Organizer_A',
        'g2, User_1, Organizer_A',
        'p, Role_v, ANY_MEMBER, Activation, read, allow',
        // Fresh edge the shared tree does not know yet - what a cache-miss reload fetches right after Merchant_new is created.
        'g3, Merchant_new, Organizer_A',
      ],
    });
    await enforcer.configure();

    const decision = await decide({
      enforcer,
      userId: 1,
      resource: 'Activation',
      action: 'read',
      domain: 'Merchant_new',
    });
    expect(decision).toBe('allow');
  });
});
