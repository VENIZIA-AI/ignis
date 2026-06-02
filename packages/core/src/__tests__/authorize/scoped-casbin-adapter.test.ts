import { describe, expect, test } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { IDataSource } from '@/base/datasources';
import {
  ScopedCasbinAdapter,
  type IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/scoped-casbin.adapter';

const dialect = new PgDialect();

const entities = (): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

// Stub connector. CRITICAL: Drizzle parameterizes interpolated VALUES — `sql\`... = ${'assign_role'}\``
// compiles to `... = $1` with 'assign_role' in `params`, NOT in the SQL string. So a stub that needs
// to pick rows per variant MUST branch on `params`, never on the SQL text. (Verified empirically.)
function makeAdapter(rowsFor: (sqlText: string, params: unknown[]) => unknown[] = () => []) {
  const captured: string[] = [];
  const connector = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      captured.push(text);
      return { rows: rowsFor(text, params) };
    },
  };
  const dataSource = { connector } as unknown as IDataSource;
  const adapter = new ScopedCasbinAdapter({ dataSource, entities: entities() });
  return { adapter, captured };
}

describe('ScopedCasbinAdapter — skeleton', () => {
  test('constructs and reports filtered', () => {
    const { adapter } = makeAdapter();
    expect(adapter.isFiltered()).toBe(true);
  });
});

describe('ScopedCasbinAdapter — queryRoleAssignments', () => {
  test('SQL is schema-qualified and filters assign_role for the user', async () => {
    const { adapter, captured } = makeAdapter();
    await adapter['queryRoleAssignments']({ principal: { type: 'User', id: 'u1' } });
    expect(captured[0]).toContain('"identity"."PolicyDefinition"');
    expect(captured[0]).toContain('deleted_at');
  });

  test('rows become g lines; null domain → "*"; collects roleIds', async () => {
    const { adapter } = makeAdapter(() => [
      { roleId: 'r1', domain: null },
      { roleId: 'r2', domain: 'Merchant_7' },
    ]);
    const { lines, roleIds } = await adapter['queryRoleAssignments']({
      principal: { type: 'User', id: 'u1' },
    });
    expect(lines).toContain('g, User_u1, Role_r1, *');
    expect(lines).toContain('g, User_u1, Role_r2, Merchant_7');
    expect(roleIds).toEqual(['r1', 'r2']);
  });
});

describe('ScopedCasbinAdapter — queryMemberships', () => {
  test('rows become g2 lines using <type>_<id>', async () => {
    const { adapter, captured } = makeAdapter(() => [
      { domainType: 'Merchant', domainId: '7' },
      { domainType: 'Organizer', domainId: '3' },
    ]);
    const lines = await adapter['queryMemberships']({
      principal: { type: 'User', id: 'u1' },
    });
    expect(captured[0]).toContain('"identity"."PolicyDefinition"');
    expect(lines).toContain('g2, User_u1, Merchant_7');
    expect(lines).toContain('g2, User_u1, Organizer_3');
  });
});

import { AuthorizationDomainScopes } from '@/components/auth/authorize/common/constants';

describe('ScopedCasbinAdapter — queryGrants', () => {
  test('joins Permission for code; null effect→allow; null domain→ANY_MEMBER', async () => {
    const { adapter, captured } = makeAdapter(() => [
      { subjectId: 'u1', objectCode: 'Activation', action: 'read', effect: null, domain: null },
      {
        subjectId: 'u1',
        objectCode: 'Order.findById',
        action: 'read',
        effect: 'deny',
        domain: 'Merchant_7',
      },
    ]);
    const lines = await adapter['queryGrants']({
      subject: { type: 'User', ids: ['u1'] },
    });
    expect(captured[0]).toContain('"identity"."Permission"');
    expect(lines).toContain(
      `p, User_u1, ${AuthorizationDomainScopes.ANY_MEMBER}, Activation, read, allow`,
    );
    expect(lines).toContain('p, User_u1, Merchant_7, Order.findById, read, deny');
  });

  test('returns empty when no subjectIds', async () => {
    const { adapter } = makeAdapter(() => [
      { objectCode: 'X', action: 'read', effect: null, domain: null },
    ]);
    const lines = await adapter['queryGrants']({ subject: { type: 'Role', ids: [] } });
    expect(lines).toEqual([]);
  });
});

describe('ScopedCasbinAdapter — structural trees', () => {
  test('emits g/g4/g5/g3 lines from the four hierarchy tables', async () => {
    // Branch on PARAMS (variant value lives there, not in the SQL text).
    const { adapter } = makeAdapter((_text, params) => {
      if (params.includes('role_inherits')) {
        return [{ childId: 'r2', parentId: 'r1' }];
      }
      if (params.includes('resource_inherits')) {
        return [{ childCode: 'OrderItem', parentCode: 'Order' }];
      }
      if (params.includes('action_inherits')) {
        return [{ childCode: 'read', parentCode: 'manage' }];
      }
      if (params.includes('domain_inherits')) {
        return [{ childType: 'Branch', childId: '1', parentType: 'Company', parentId: '1' }];
      }
      return [];
    });

    const lines = await adapter['loadStructuralTrees']();
    expect(lines).toContain('g, Role_r2, Role_r1, *');
    expect(lines).toContain('g4, OrderItem, Order');
    expect(lines).toContain('g5, read, manage');
    expect(lines).toContain('g3, Branch_1, Company_1');
  });
});

describe('ScopedCasbinAdapter — role closure', () => {
  test('expands assigned roles to include transitive parents', () => {
    const { adapter } = makeAdapter();
    // structural g edges: r2→r1, r1→r0  (child, parent)
    const closure = adapter['expandRoleClosure']({
      role: { ids: ['r2'], edges: ['g, Role_r2, Role_r1, *', 'g, Role_r1, Role_r0, *'] },
    });
    expect(new Set(closure)).toEqual(new Set(['r2', 'r1', 'r0']));
  });

  test('handles cycles without infinite loop', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({
      role: { ids: ['a'], edges: ['g, Role_a, Role_b, *', 'g, Role_b, Role_a, *'] },
    });
    expect(new Set(closure)).toEqual(new Set(['a', 'b']));
  });
});

import { newEnforcer, newModelFromString, Util } from 'casbin';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { objectMatch } from '@/components/auth/authorize/common/object-match';

describe('ScopedCasbinAdapter — loadFilteredPolicy end-to-end', () => {
  test('user gets role-granted access in a joined domain', async () => {
    // Canned DB: U joined Merchant_7, has Role_op (global assign), Role_op granted read on Order (ANY_MEMBER).
    // Branch on PARAMS (variant value is a bound param, not in the SQL text).
    const { adapter } = makeAdapter((_text, params) => {
      if (params.includes('assign_role')) {
        return [{ roleId: 'op', domain: null }];
      }
      if (params.includes('join_domain')) {
        return [{ domainType: 'Merchant', domainId: '7' }];
      }
      // Role grants only (subject_type='Role'); user 'u1' has no direct grant.
      if (params.includes('grant') && params.includes('Role')) {
        return [
          { subjectId: 'op', objectCode: 'Order', action: 'read', effect: null, domain: null },
        ];
      }
      return []; // user grants + structural trees empty
    });

    const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
    const enforcer = await newEnforcer(model);
    await enforcer.addNamedDomainMatchingFunc('g', Util.keyMatchFunc);
    // objectMatch must be BOTH a direct matcher function (graph-free prefix/wildcard) AND the g4
    // matching func (stored-edge traversal) — see Plan 1 finding. Registering only one breaks enforce.
    await enforcer.addFunction('objectMatch', objectMatch);
    await enforcer.addNamedMatchingFunc('g4', objectMatch);

    await adapter.loadFilteredPolicy(enforcer.getModel(), {
      principal: { type: 'User', id: 'u1' },
    });
    await enforcer.buildRoleLinks();

    expect(enforcer.enforceSync('User_u1', 'Merchant_7', 'Order', 'read')).toBe(true);
    expect(enforcer.enforceSync('User_u1', 'Merchant_99', 'Order', 'read')).toBe(false); // not a member
  });
});
