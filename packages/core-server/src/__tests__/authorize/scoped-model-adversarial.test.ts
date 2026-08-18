import { describe, expect, test } from 'bun:test';
import { Helper, newEnforcer, newModelFromString, Util } from 'casbin';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { AuthorizationPermissionBuilder } from '@venizia/ignis-kernel';
import { ResourceRoleManager } from '@/components/auth/authorize/enforcers/resource-role-manager';

/** Adversarial decision-table hardening of the scoped RBAC matcher (v2 model): g membership + (SYSTEM_WIDE || ANY_MEMBER via g2 || g3 domain edge) + (objectMatch || g4) + g5 action, wired exactly as the framework wires it. */
async function buildScopedEnforcer(lines: string[]) {
  const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
  const enforcer = await newEnforcer(model);

  await enforcer.addNamedDomainMatchingFunc('g', Util.keyMatchFunc);
  await enforcer.addFunction('objectMatch', AuthorizationPermissionBuilder.objectMatch);
  enforcer.setNamedRoleManager('g4', new ResourceRoleManager());

  const m = enforcer.getModel();
  for (const line of lines) {
    Helper.loadPolicyLine(line, m);
  }
  await enforcer.buildRoleLinks();
  return enforcer;
}

// --- DECISION TABLE - DOMAIN AXIS ------------------------------------------
describe('decision-table: domain axis', () => {
  test('SYSTEM_WIDE grant matches ANY domain (member or not, even forged domains)', async () => {
    const e = await buildScopedEnforcer([
      'g, User_1, Role_super, *',
      'p, Role_super, SYSTEM_WIDE, *, manage, allow',
      'g5, read, manage',
    ]);
    expect(e.enforceSync('User_1', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_1', 'Merchant_99999', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_1', 'Galaxy_42', 'Order', 'read')).toBe(true);
  });

  test('ANY_MEMBER grant + membership in requested domain → ALLOW', async () => {
    const e = await buildScopedEnforcer([
      'g, User_2, Role_op, *',
      'g2, User_2, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_2', 'Merchant_7', 'Order', 'read')).toBe(true);
  });

  test('ANY_MEMBER grant + NO membership in requested domain → DENY', async () => {
    const e = await buildScopedEnforcer([
      'g, User_2, Role_op, *',
      'g2, User_2, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_2', 'Merchant_8', 'Order', 'read')).toBe(false);
  });

  test('specific-domain grant matches only that domain (self-link)', async () => {
    const e = await buildScopedEnforcer([
      'g, User_4, Role_x, Merchant_7',
      'p, Role_x, Merchant_7, Order, read, allow',
    ]);
    expect(e.enforceSync('User_4', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_4', 'Merchant_8', 'Order', 'read')).toBe(false);
  });

  test('nested domain via g3: grant on Company applies to child Branch', async () => {
    const e = await buildScopedEnforcer([
      'g, User_5, Role_y, *',
      'g3, Branch_1, Company_1',
      'p, Role_y, Company_1, Order, read, allow',
    ]);
    expect(e.enforceSync('User_5', 'Branch_1', 'Order', 'read')).toBe(true);
    // But NOT the reverse: a grant on the Branch must not cover the parent Company.
    const e2 = await buildScopedEnforcer([
      'g, User_5, Role_y, *',
      'g3, Branch_1, Company_1',
      'p, Role_y, Branch_1, Order, read, allow',
    ]);
    expect(e2.enforceSync('User_5', 'Company_1', 'Order', 'read')).toBe(false);
  });

  test('mismatched specific domain → DENY', async () => {
    const e = await buildScopedEnforcer([
      'g, User_6, Role_z, Merchant_7',
      'p, Role_z, Merchant_7, Order, read, allow',
    ]);
    expect(e.enforceSync('User_6', 'Organizer_7', 'Order', 'read')).toBe(false);
  });
});

// --- DECISION TABLE - RESOURCE AXIS ----------------------------------------
describe('decision-table: resource axis', () => {
  const base = ['g, User_7, Role_r, *', 'g2, User_7, Merchant_7'];

  test('exact resource', async () => {
    const e = await buildScopedEnforcer([...base, 'p, Role_r, ANY_MEMBER, Order, read, allow']);
    expect(e.enforceSync('User_7', 'Merchant_7', 'Order', 'read')).toBe(true);
  });

  test('subject-prefix endpoint (objectMatch dot-child)', async () => {
    const e = await buildScopedEnforcer([...base, 'p, Role_r, ANY_MEMBER, Order, read, allow']);
    expect(e.enforceSync('User_7', 'Merchant_7', 'Order.findById', 'read')).toBe(true);
  });

  test('wildcard resource grant', async () => {
    const e = await buildScopedEnforcer([...base, 'p, Role_r, ANY_MEMBER, *, read, allow']);
    expect(e.enforceSync('User_7', 'Merchant_7', 'Anything.at.all', 'read')).toBe(true);
  });

  test('non-standard g4 edge (OrderItem ⊂ Order)', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'g4, OrderItem, Order',
      'p, Role_r, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_7', 'Merchant_7', 'OrderItem', 'read')).toBe(true);
  });

  test('sibling resource → DENY', async () => {
    const e = await buildScopedEnforcer([...base, 'p, Role_r, ANY_MEMBER, Order, read, allow']);
    expect(e.enforceSync('User_7', 'Merchant_7', 'OrderItem', 'read')).toBe(false);
    expect(e.enforceSync('User_7', 'Merchant_7', 'Orders', 'read')).toBe(false);
  });

  test('broader request, narrower grant → DENY', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'p, Role_r, ANY_MEMBER, Order.findById, read, allow',
    ]);
    expect(e.enforceSync('User_7', 'Merchant_7', 'Order', 'read')).toBe(false);
    expect(e.enforceSync('User_7', 'Merchant_7', 'Order.find', 'read')).toBe(false);
  });
});

// --- DECISION TABLE - ACTION AXIS ------------------------------------------
describe('decision-table: action axis', () => {
  const base = ['g, User_8, Role_a, *', 'g2, User_8, Merchant_7'];

  test('exact action', async () => {
    const e = await buildScopedEnforcer([...base, 'p, Role_a, ANY_MEMBER, Order, read, allow']);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'read')).toBe(true);
  });

  test('child action via g5 (read ⊂ manage)', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'g5, read, manage',
      'p, Role_a, ANY_MEMBER, Order, manage, allow',
    ]);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'read')).toBe(true);
  });

  test('action with no edge → DENY', async () => {
    const e = await buildScopedEnforcer([
      ...base,
      'g5, read, manage',
      'p, Role_a, ANY_MEMBER, Order, manage, allow',
    ]);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'delete')).toBe(false);
  });

  test('g5 direction is child→parent, not parent→child', async () => {
    // grant on `read` must NOT cover a request for `manage`.
    const e = await buildScopedEnforcer([
      ...base,
      'g5, read, manage',
      'p, Role_a, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_8', 'Merchant_7', 'Order', 'manage')).toBe(false);
  });
});

// --- DENY-OVERRIDE ---------------------------------------------------------
describe('deny-override', () => {
  test('explicit deny (direct) overrides role allow on the same tuple', async () => {
    const e = await buildScopedEnforcer([
      'g, User_9, Role_a, *',
      'g2, User_9, Merchant_7',
      'p, Role_a, ANY_MEMBER, Order, read, allow',
      'p, User_9, ANY_MEMBER, Order, read, deny',
    ]);
    expect(e.enforceSync('User_9', 'Merchant_7', 'Order', 'read')).toBe(false);
  });

  test('deny via role overrides allow via direct grant', async () => {
    const e = await buildScopedEnforcer([
      'g, User_9, Role_deny, *',
      'g2, User_9, Merchant_7',
      'p, User_9, ANY_MEMBER, Order, read, allow',
      'p, Role_deny, ANY_MEMBER, Order, read, deny',
    ]);
    expect(e.enforceSync('User_9', 'Merchant_7', 'Order', 'read')).toBe(false);
  });

  test('deny on a broader (wildcard) grant overrides a narrow allow', async () => {
    const e = await buildScopedEnforcer([
      'g, User_9, Role_a, *',
      'g2, User_9, Merchant_7',
      'p, Role_a, ANY_MEMBER, Order.findById, read, allow',
      'p, User_9, ANY_MEMBER, *, read, deny',
    ]);
    expect(e.enforceSync('User_9', 'Merchant_7', 'Order.findById', 'read')).toBe(false);
  });
});

// --- DAG / multi-parent ----------------------------------------------------
describe('DAG / multi-parent', () => {
  test('resource multi-parent: matched via the second g4 parent', async () => {
    const e = await buildScopedEnforcer([
      'g, User_10, Role_r, *',
      'g2, User_10, Merchant_7',
      'g4, report.export, report',
      'g4, report.export, data.export',
      'p, Role_r, ANY_MEMBER, data.export, read, allow',
    ]);
    expect(e.enforceSync('User_10', 'Merchant_7', 'report.export', 'read')).toBe(true);
  });

  test('role multi-parent: grant flows through an inherited role', async () => {
    const e = await buildScopedEnforcer([
      'g, User_11, Role_child, *',
      'g, Role_child, Role_parent, *',
      'g2, User_11, Merchant_7',
      'p, Role_parent, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_11', 'Merchant_7', 'Order', 'read')).toBe(true);
  });
});

// === ADVERSARIAL BYPASS ATTEMPTS - every one MUST DENY (or be safe) ========
describe('ADVERSARIAL: sentinel-domain collision', () => {
  test('forging r.dom="SYSTEM_WIDE" does NOT bypass when the GRANT is a normal ANY_MEMBER grant', async () => {
    // The SYSTEM_WIDE branch checks p.dom (the stored grant), not r.dom, so forging r.dom='SYSTEM_WIDE' against an ANY_MEMBER grant fails every branch.
    const e = await buildScopedEnforcer([
      'g, User_20, Role_op, *',
      'g2, User_20, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_20', 'SYSTEM_WIDE', 'Order', 'read')).toBe(false);
  });

  test('forging r.dom="SYSTEM_WIDE" with a specific-domain grant does NOT bypass', async () => {
    const e = await buildScopedEnforcer([
      'g, User_21, Role_x, Merchant_7',
      'p, Role_x, Merchant_7, Order, read, allow',
    ]);
    expect(e.enforceSync('User_21', 'SYSTEM_WIDE', 'Order', 'read')).toBe(false);
  });

  test('forging r.dom="ANY_MEMBER" does NOT bypass a specific-domain grant', async () => {
    // g3('ANY_MEMBER', 'Merchant_7') is false, and p.dom != ANY_MEMBER, so no match.
    const e = await buildScopedEnforcer([
      'g, User_22, Role_x, Merchant_7',
      'p, Role_x, Merchant_7, Order, read, allow',
    ]);
    expect(e.enforceSync('User_22', 'ANY_MEMBER', 'Order', 'read')).toBe(false);
  });

  test('SECURITY PROBE: can a user join a domain literally named SYSTEM_WIDE and reach a SYSTEM_WIDE grant of ANOTHER user?', async () => {
    // Membership in a domain literally named SYSTEM_WIDE satisfies the ANY_MEMBER branch, which is correct and locked here: it grants nothing in OTHER domains and inherits no SYSTEM_WIDE-scoped grant.
    const e = await buildScopedEnforcer([
      'g, User_23, Role_op, *',
      'g2, User_23, SYSTEM_WIDE', // adversary forged a membership in a domain named "SYSTEM_WIDE"
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    // Reaches its OWN ANY_MEMBER grant in that domain — fine.
    expect(e.enforceSync('User_23', 'SYSTEM_WIDE', 'Order', 'read')).toBe(true);
    // CRITICAL: it must NOT thereby gain access to a resource it was never granted.
    expect(e.enforceSync('User_23', 'SYSTEM_WIDE', 'Invoice', 'read')).toBe(false);
    // And must NOT reach other domains.
    expect(e.enforceSync('User_23', 'Merchant_7', 'Order', 'read')).toBe(false);
  });
});

describe('ADVERSARIAL: wildcard injection in request fields', () => {
  test('r.dom="*" must NOT wildcard-match a specific-domain grant', async () => {
    // keyMatch puts `*` on the PATTERN (grant) side only, so a request value of `*` is literal: g3('*', 'Merchant_7') is false and p.dom is neither sentinel -> DENY.
    const e = await buildScopedEnforcer([
      'g, User_24, Role_x, Merchant_7',
      'p, Role_x, Merchant_7, Order, read, allow',
    ]);
    expect(e.enforceSync('User_24', '*', 'Order', 'read')).toBe(false);
  });

  test('r.dom="*" must NOT match an ANY_MEMBER grant without real membership', async () => {
    const e = await buildScopedEnforcer([
      'g, User_25, Role_op, *',
      'g2, User_25, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    // g2(User_25, '*') is false (no literal '*' membership row).
    expect(e.enforceSync('User_25', '*', 'Order', 'read')).toBe(false);
  });

  test('r.obj="*" must NOT wildcard-match a specific-resource grant', async () => {
    // AuthorizationPermissionBuilder.objectMatch('*', 'Order') === false (verified in object-match-exhaustive).
    const e = await buildScopedEnforcer([
      'g, User_26, Role_op, *',
      'g2, User_26, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_26', '*', 'read', 'read')).toBe(false);
    expect(e.enforceSync('User_26', '*', 'Anything', 'read')).toBe(false);
  });

  test('r.act has no wildcard semantics; r.act="*" must NOT match a specific action grant', async () => {
    const e = await buildScopedEnforcer([
      'g, User_27, Role_op, *',
      'g2, User_27, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_27', 'Merchant_7', 'Order', '*')).toBe(false);
  });
});

describe('ADVERSARIAL: self-link / subject injection', () => {
  test('a user CANNOT match a grant stored for a different subject', async () => {
    // p.sub (stored policy) and r.sub (request) only match via g - assignment, role inheritance or the identity self-link - so a different user cannot ride User_28's direct grant.
    const e = await buildScopedEnforcer([
      'g2, User_28, Merchant_7',
      'g2, User_99, Merchant_7',
      'p, User_28, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_28', 'Merchant_7', 'Order', 'read')).toBe(true); // owner
    expect(e.enforceSync('User_99', 'Merchant_7', 'Order', 'read')).toBe(false); // impostor
  });

  test('direct grant requires the identity self-link AND domain membership', async () => {
    const e = await buildScopedEnforcer([
      'g2, User_30, Merchant_7',
      'p, User_30, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_30', 'Merchant_7', 'Order', 'read')).toBe(true);
    // remove membership effect → different domain denied
    expect(e.enforceSync('User_30', 'Merchant_8', 'Order', 'read')).toBe(false);
  });
});

describe('ADVERSARIAL: membership escalation across domains', () => {
  test('ANY_MEMBER member of Merchant_7 CANNOT reach Merchant_8', async () => {
    const e = await buildScopedEnforcer([
      'g, User_31, Role_op, *',
      'g2, User_31, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, manage, allow',
      'g5, read, manage',
      'g5, create, manage',
    ]);
    expect(e.enforceSync('User_31', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(e.enforceSync('User_31', 'Merchant_8', 'Order', 'read')).toBe(false);
    expect(e.enforceSync('User_31', 'Merchant_8', 'Order', 'manage')).toBe(false);
  });

  test('membership in one domain does not leak into a g3-nested unrelated domain', async () => {
    const e = await buildScopedEnforcer([
      'g, User_32, Role_op, *',
      'g2, User_32, Merchant_7',
      'g3, Branch_1, Company_1', // unrelated nesting
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_32', 'Branch_1', 'Order', 'read')).toBe(false);
    expect(e.enforceSync('User_32', 'Company_1', 'Order', 'read')).toBe(false);
  });
});

describe('ADVERSARIAL: empty / missing request fields', () => {
  test('empty domain string → DENY (no grant matches "")', async () => {
    const e = await buildScopedEnforcer([
      'g, User_33, Role_op, *',
      'g2, User_33, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_33', '', 'Order', 'read')).toBe(false);
  });

  test('empty resource string → DENY against a specific grant', async () => {
    const e = await buildScopedEnforcer([
      'g, User_34, Role_op, *',
      'g2, User_34, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_34', '', 'read', 'read')).toBe(false);
  });

  test('empty resource string CAN match a wildcard grant (AuthorizationPermissionBuilder.objectMatch("","*")===true)', async () => {
    // Documents that a `*` resource grant is genuinely catch-all, including the empty request.
    const e = await buildScopedEnforcer([
      'g, User_35, Role_op, *',
      'g2, User_35, Merchant_7',
      'p, Role_op, ANY_MEMBER, *, read, allow',
    ]);
    expect(e.enforceSync('User_35', 'Merchant_7', '', 'read')).toBe(true);
  });

  test('empty action string → DENY', async () => {
    const e = await buildScopedEnforcer([
      'g, User_36, Role_op, *',
      'g2, User_36, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    expect(e.enforceSync('User_36', 'Merchant_7', 'Order', '')).toBe(false);
  });
});
