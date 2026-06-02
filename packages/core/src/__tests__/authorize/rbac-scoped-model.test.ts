import { describe, expect, test } from 'bun:test';
import {
  AuthorizationDomainScopes,
  AuthorizationPolicyVariants,
} from '@/components/auth/authorize/common/constants';

describe('AuthorizationDomainScopes', () => {
  test('exposes ANY_MEMBER and SYSTEM_WIDE sentinels', () => {
    expect(AuthorizationDomainScopes.ANY_MEMBER).toBe('ANY_MEMBER');
    expect(AuthorizationDomainScopes.SYSTEM_WIDE).toBe('SYSTEM_WIDE');
    expect(AuthorizationDomainScopes.SCHEME_SET.has('ANY_MEMBER')).toBe(true);
    expect(AuthorizationDomainScopes.SCHEME_SET.has('SYSTEM_WIDE')).toBe(true);
    expect(AuthorizationDomainScopes.isValid('Merchant_7')).toBe(false);
  });
});

describe('AuthorizationPolicyVariants', () => {
  test('exposes the explicit edge-type names', () => {
    expect(AuthorizationPolicyVariants.GRANT.action).toBe('grant');
    expect(AuthorizationPolicyVariants.ASSIGN_ROLE.action).toBe('assign_role');
    expect(AuthorizationPolicyVariants.JOIN_DOMAIN.action).toBe('join_domain');
    expect(AuthorizationPolicyVariants.ROLE_INHERITS.action).toBe('role_inherits');
    expect(AuthorizationPolicyVariants.RESOURCE_INHERITS.action).toBe('resource_inherits');
    expect(AuthorizationPolicyVariants.ACTION_INHERITS.action).toBe('action_inherits');
    expect(AuthorizationPolicyVariants.DOMAIN_INHERITS.action).toBe('domain_inherits');
  });
});

import { objectMatch } from '@/components/auth/authorize/common/object-match';

describe('objectMatch(requested, granted)', () => {
  test('wildcard grant matches anything', () => {
    expect(objectMatch('Activation', '*')).toBe(true);
    expect(objectMatch('Activation.findById', '*')).toBe(true);
  });

  test('exact match', () => {
    expect(objectMatch('Order', 'Order')).toBe(true);
    expect(objectMatch('Order.findById', 'Order.findById')).toBe(true);
  });

  test('endpoint is under its subject (dot prefix)', () => {
    expect(objectMatch('Activation.findById', 'Activation')).toBe(true);
    expect(objectMatch('Activation.find', 'Activation')).toBe(true);
  });

  test('different subject does not match by prefix', () => {
    expect(objectMatch('Activation', 'Order')).toBe(false);
    expect(objectMatch('OrderItem', 'Order')).toBe(false); // sibling, not dot-child → needs g4 edge
    expect(objectMatch('Order', 'Order.findById')).toBe(false); // broader request, narrower grant
  });
});

import { newModelFromString } from 'casbin';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';

describe('CASBIN_RBAC_DOMAIN_SCOPED_MODEL', () => {
  test('parses and declares all five grouping relations', () => {
    const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
    const g = model.model.get('g');
    expect(g?.has('g')).toBe(true);
    expect(g?.has('g4')).toBe(true);
    expect(g?.has('g5')).toBe(true);
    expect(g?.has('g3')).toBe(true);
    expect(g?.has('g2')).toBe(true);
  });
});

import { Helper, newEnforcer, Util } from 'casbin';

// Build a casbin enforcer on the v2 model, register the matching funcs exactly as the
// framework will, then hand-feed policy lines. Mirrors how CasbinAuthorizationEnforcer wires it.
async function buildScopedEnforcer(lines: string[]) {
  const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
  const enforcer = await newEnforcer(model);

  // g: domain matching so a `*` domain on an assign_role/role_inherits link matches any request domain.
  await enforcer.addNamedDomainMatchingFunc('g', Util.keyMatchFunc);
  // objectMatch: registered as a direct matcher expression function for "graph-free" prefix/wildcard matching.
  // casbin's role-manager hasLink only traverses stored nodes, so objectMatch must be callable directly in
  // the matcher expression (objectMatch(r.obj, p.obj)) as well as via g4 for explicit edge traversal.
  await enforcer.addFunction('objectMatch', objectMatch);
  // g4: resource prefix/wildcard matching func for stored edge traversal (explicit resource_inherits edges).
  await enforcer.addNamedMatchingFunc('g4', objectMatch);

  const m = enforcer.getModel();
  for (const line of lines) {
    Helper.loadPolicyLine(line, m);
  }
  await enforcer.buildRoleLinks();
  return enforcer;
}

describe('scoped model — subject & role grants', () => {
  test('role grant via assignment is allowed (ANY_MEMBER + membership)', async () => {
    const e = await buildScopedEnforcer([
      'g, User_2, Role_op, *',
      'g2, User_2, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_2', 'Merchant_7', 'Order', 'read')).toBe(true);
  });

  test('direct user grant is allowed via self-link', async () => {
    const e = await buildScopedEnforcer([
      'g2, User_3, Merchant_7',
      'p, User_3, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_3', 'Merchant_7', 'Order', 'read')).toBe(true);
  });

  test('no matching grant is denied', async () => {
    const e = await buildScopedEnforcer([
      'g, User_2, Role_op, *',
      'g2, User_2, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_2', 'Merchant_7', 'Invoice', 'read')).toBe(false);
  });
});

describe('scoped model — domain scopes', () => {
  test('SYSTEM_WIDE grant applies to any domain, even non-member', async () => {
    const e = await buildScopedEnforcer([
      'g, User_1, Role_super, *',
      'p, Role_super, SYSTEM_WIDE, *, manage, allow',
      'g5, read, manage',
    ]);
    expect(e.enforceSync('User_1', 'Merchant_99', 'Activation', 'read')).toBe(true);
  });

  test('ANY_MEMBER grant is DENIED in a domain the user has not joined', async () => {
    const e = await buildScopedEnforcer([
      'g, User_2, Role_op, *',
      'g2, User_2, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_2', 'Merchant_99', 'Order', 'read')).toBe(false);
  });

  test('domain-specific grant matches only that domain (self-link)', async () => {
    const e = await buildScopedEnforcer([
      'g, User_4, Role_x, Merchant_7',
      'p, Role_x, Merchant_7, Order, read, allow',
    ]);
    expect(e.enforceSync('User_4', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_4', 'Merchant_8', 'Order', 'read')).toBe(false);
  });

  test('domain nesting: grant on Company applies to Branch via g3 edge', async () => {
    const e = await buildScopedEnforcer([
      'g, User_5, Role_y, *',
      'g3, Branch_1, Company_1',
      'p, Role_y, Company_1, Order, read, allow',
    ]);
    expect(e.enforceSync('User_5', 'Branch_1', 'Order', 'read')).toBe(true);
  });
});

describe('scoped model — resource hierarchy', () => {
  const base = ['g, User_6, Role_v, *', 'g2, User_6, Merchant_7'];

  test('grant at subject covers its endpoints (prefix)', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'p, Role_v, ANY_MEMBER, Activation, read, allow',
    ]);
    expect(e.enforceSync('User_6', 'Merchant_7', 'Activation.findById', 'read')).toBe(true);
    expect(e.enforceSync('User_6', 'Merchant_7', 'Activation', 'read')).toBe(true);
  });

  test('fine-grained grant: only the named endpoint, not siblings', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'p, Role_v, ANY_MEMBER, Activation.findById, read, allow',
    ]);
    expect(e.enforceSync('User_6', 'Merchant_7', 'Activation.findById', 'read')).toBe(true);
    expect(e.enforceSync('User_6', 'Merchant_7', 'Activation.find', 'read')).toBe(false);
  });

  test('non-standard nesting via resource_inherits edge (OrderItem ⊂ Order)', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'g4, OrderItem, Order',
      'p, Role_v, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_6', 'Merchant_7', 'OrderItem', 'read')).toBe(true);
  });
});

describe('scoped model — action hierarchy', () => {
  const base = ['g, User_8, Role_m, *', 'g2, User_8, Merchant_7'];

  test('manage grant covers child actions via g5 edges', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'g5, read, manage',
      'g5, create, manage',
      'p, Role_m, ANY_MEMBER, Order, manage, allow',
    ]);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'create')).toBe(true);
  });

  test('action with no edge is denied (manage does not implicitly include delete)', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'g5, read, manage',
      'p, Role_m, ANY_MEMBER, Order, manage, allow',
    ]);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'delete')).toBe(false);
  });

  test('flat action (no g5 edges) still matches exactly via self-link', async () => {
    const e = await buildScopedEnforcer([...base, 'p, Role_m, ANY_MEMBER, Order, read, allow']);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'update')).toBe(false);
  });
});

describe('scoped model — deny-override & DAG', () => {
  test('an explicit deny overrides an allow from a role', async () => {
    const e = await buildScopedEnforcer([
      'g, User_9, Role_a, *',
      'g2, User_9, Merchant_7',
      'p, Role_a, ANY_MEMBER, Order, read, allow',
      'p, User_9, ANY_MEMBER, Order, read, deny',
    ]);
    expect(e.enforceSync('User_9', 'Merchant_7', 'Order', 'read')).toBe(false);
  });

  test('resource DAG: a node under either parent matches (multi-parent)', async () => {
    const e = await buildScopedEnforcer([
      'g, User_10, Role_r, *',
      'g2, User_10, Merchant_7',
      'g4, report.export, report',
      'g4, report.export, data.export',
      'p, Role_r, ANY_MEMBER, data.export, read, allow',
    ]);
    // granted via the SECOND parent (data.export), proving multi-parent resolution
    expect(e.enforceSync('User_10', 'Merchant_7', 'report.export', 'read')).toBe(true);
  });

  test('role DAG: inherited role grant flows transitively', async () => {
    const e = await buildScopedEnforcer([
      'g, User_11, Role_child, *',
      'g, Role_child, Role_parent, *', // role_inherits, domain-agnostic via keyMatch
      'g2, User_11, Merchant_7',
      'p, Role_parent, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_11', 'Merchant_7', 'Order', 'read')).toBe(true);
  });
});
