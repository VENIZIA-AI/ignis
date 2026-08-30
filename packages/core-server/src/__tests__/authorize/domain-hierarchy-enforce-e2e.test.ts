import { describe, expect, test } from 'bun:test';
import { asTypedContext } from '@venizia/ignis-kernel';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { AuthorizationDomainScopes, CasbinEnforcerModelDrivers } from '@venizia/ignis-kernel';
import type { FilteredAdapter, Model } from 'casbin';

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
// These are `g3` policy lines - the only way domain-hierarchy edges enter the system - as a real
// adapter would emit them from either the DOMAIN_EDGE branch (domain_inherits rows) or the
// resolveDomainEdges hook.
const HIERARCHY_LINES = [
  'g3, Merchant_1, Organizer_A',
  'g3, Merchant_2, Organizer_A',
  'g3, Merchant_9, Organizer_B',
];

const scopedEnforcer = (opts: { lines: string[] }) =>
  new CasbinAuthorizationEnforcer({
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    adapter: new FixedScopedAdapter(opts.lines),
    isScoped: true,
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

describe('CasbinAuthorizationEnforcer - domain hierarchy: g axis (role assignment cascades down)', () => {
  test('a role assigned at the parent organizer is allowed at both child merchants', async () => {
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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

  test('no g3 edge at all: a role assigned at Organizer_A is denied at Merchant_1', async () => {
    const enforcer = scopedEnforcer({
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
});

describe('CasbinAuthorizationEnforcer - domain hierarchy: g3 axis (grant domain cascades down)', () => {
  test('a grant carrying domain Organizer_A applies at child Merchant_1', async () => {
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
        'g, User_1, Role_v, *',
        'p, Role_v, Organizer_A, Activation, read, allow',
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

  test('a grant carrying domain Merchant_1 applies at Merchant_1 (self-match) but not at sibling Merchant_2', async () => {
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
        'g, User_1, Role_v, *',
        'p, Role_v, Merchant_1, Activation, read, allow',
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
});

describe('CasbinAuthorizationEnforcer - domain hierarchy: g2 axis (membership climbs up)', () => {
  test('joining Organizer_A satisfies an ANY_MEMBER grant at child Merchant_1', async () => {
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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

describe('CasbinAuthorizationEnforcer - domain hierarchy: fail-closed defaults and deny-override', () => {
  test('a domain-less request falls back to SYSTEM_WIDE - an ANY_MEMBER grant plus real membership still denies', async () => {
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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
    const enforcer = scopedEnforcer({
      lines: [
        ...HIERARCHY_LINES,
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

describe('CasbinAuthorizationEnforcer - domain hierarchy WIDENING (intentional, audit before enabling)', () => {
  // Same policy lines in both tests: a wildcard-domain role assignment (`g, User, Role, *`, what the
  // adapter emits for a domain-less role grant) plus membership joined at the parent organizer. A
  // `g3` edge turns the previously-scoped-to-Organizer_A membership into access at the child merchant
  // too - this is the widening surfaced in review, so an app supplying `g3` edges from its own
  // domain_inherits rows or a resolveDomainEdges hook must audit for it.
  const widenedLines = [
    'g, User_1, Role_v, *',
    'g2, User_1, Organizer_A',
    'p, Role_v, ANY_MEMBER, Activation, read, allow',
  ];

  test('no g3 edge for Merchant_1: wildcard-domain role + parent-domain membership is denied at child Merchant_1', async () => {
    const enforcer = scopedEnforcer({ lines: widenedLines });
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

  test('a g3 edge Merchant_1 -> Organizer_A: the SAME wildcard-domain role + parent-domain membership is now allowed at child Merchant_1 - audit before enabling', async () => {
    const enforcer = scopedEnforcer({
      lines: [...widenedLines, 'g3, Merchant_1, Organizer_A'],
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
});
