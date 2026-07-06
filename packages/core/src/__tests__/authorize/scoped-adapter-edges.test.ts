import { describe, expect, test } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { ICasbinPolicySource } from '@/components/auth/authorize/adapters/types';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import type { IScopedCasbinEntities } from '@/components/auth/authorize/adapters/types';
import { AuthorizationDomainScopes } from '@/components/auth/authorize/common/constants';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';

const dialect = new PgDialect();

const entities = (): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

// Stub connector — branch on PARAMS (Drizzle parameterizes interpolated VALUES; variant lives in params).
function makeAdapter(rowsFor: (sqlText: string, params: unknown[]) => unknown[] = () => []) {
  const captured: string[] = [];
  let executeCalls = 0;
  const connector = {
    execute: async (query: SQL) => {
      executeCalls += 1;
      const { sql: text, params } = dialect.sqlToQuery(query);
      captured.push(text);
      return { rows: rowsFor(text, params) };
    },
  };
  // TCasbinPolicyConnector is drizzle's full generated node-postgres database type (select/insert/
  // update/delete/transaction/...); the adapter only ever calls `.execute`, so the stub only implements that.
  const dataSource = { connector } as ICasbinPolicySource;
  const adapter = new ScopedCasbinAdapter({ dataSource, entities: entities() });
  return { adapter, captured, getExecuteCalls: () => executeCalls };
}

describe('scoped-adapter-edges — expandRoleClosure', () => {
  test('empty roleIds → empty closure', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({
      role: { ids: [], edges: ['g, Role_a, Role_b, *'] },
    });
    expect(closure).toEqual([]);
  });

  test('self-loop edge (a → a) does not spin', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({
      role: { ids: ['a'], edges: ['g, Role_a, Role_a, *'] },
    });
    expect(new Set(closure)).toEqual(new Set(['a']));
  });

  test('diamond (multi-parent) collects every ancestor once', () => {
    const { adapter } = makeAdapter();
    // d → b, d → c, b → a, c → a  (a reached by two paths but counted once)
    const closure = adapter['expandRoleClosure']({
      role: {
        ids: ['d'],
        edges: [
          'g, Role_d, Role_b, *',
          'g, Role_d, Role_c, *',
          'g, Role_b, Role_a, *',
          'g, Role_c, Role_a, *',
        ],
      },
    });
    expect(new Set(closure)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  test('three-node cycle terminates', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({
      role: {
        ids: ['a'],
        edges: ['g, Role_a, Role_b, *', 'g, Role_b, Role_c, *', 'g, Role_c, Role_a, *'],
      },
    });
    expect(new Set(closure)).toEqual(new Set(['a', 'b', 'c']));
  });

  test('missing parent edges → role kept, no expansion', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({ role: { ids: ['lonely'], edges: [] } });
    expect(new Set(closure)).toEqual(new Set(['lonely']));
  });

  test('non-g lines and malformed edges are ignored', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({
      role: { ids: ['a'], edges: ['g4, X, Y', 'garbage', 'g, Role_a, Role_b, *'] },
    });
    expect(new Set(closure)).toEqual(new Set(['a', 'b']));
  });

  test('multiple seed roles each expanded', () => {
    const { adapter } = makeAdapter();
    const closure = adapter['expandRoleClosure']({
      role: { ids: ['x', 'y'], edges: ['g, Role_x, Role_p, *', 'g, Role_y, Role_q, *'] },
    });
    expect(new Set(closure)).toEqual(new Set(['x', 'y', 'p', 'q']));
  });
});

describe('scoped-adapter-edges — queryGrants', () => {
  test('empty subjectIds short-circuits to [] without querying', async () => {
    const { adapter, getExecuteCalls } = makeAdapter(() => [{ objectCode: 'X', action: 'read' }]);
    const lines = await adapter['queryGrants']({ subject: { type: 'Role', ids: [] } });
    expect(lines).toEqual([]);
    expect(getExecuteCalls()).toBe(0); // never hit the DB
  });

  test('null action → row dropped (no malformed line emitted)', async () => {
    const { adapter } = makeAdapter(() => [
      { subjectId: 'u1', objectCode: 'Order', action: null, effect: null, domain: null },
      { subjectId: 'u1', objectCode: 'Order', action: 'read', effect: null, domain: null },
    ]);
    const lines = await adapter['queryGrants']({ subject: { type: 'User', ids: ['u1'] } });
    expect(lines).toEqual([
      `p, User_u1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order, read, allow`,
    ]);
  });

  test('null effect → allow; null domain → ANY_MEMBER; explicit values preserved', async () => {
    const { adapter } = makeAdapter(() => [
      { subjectId: 'u1', objectCode: 'A', action: 'read', effect: null, domain: null },
      { subjectId: 'u1', objectCode: 'B', action: 'write', effect: 'deny', domain: 'Merchant_7' },
    ]);
    const lines = await adapter['queryGrants']({ subject: { type: 'User', ids: ['u1'] } });
    expect(lines).toContain(`p, User_u1, ${AuthorizationDomainScopes.ANY_MEMBER}, A, read, allow`);
    expect(lines).toContain('p, User_u1, Merchant_7, B, write, deny');
  });
});

describe('scoped-adapter-edges — line emission shapes', () => {
  test('assign_role: null domain → "*", explicit domain preserved (g)', async () => {
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

  test('join_domain → g2 line per membership', async () => {
    const { adapter } = makeAdapter(() => [
      { domainType: 'Merchant', domainId: '7' },
      { domainType: 'Organizer', domainId: '9' },
    ]);
    const lines = await adapter['queryMemberships']({
      principal: { type: 'User', id: 'u1' },
    });
    expect(lines).toEqual(['g2, User_u1, Merchant_7', 'g2, User_u1, Organizer_9']);
  });

  test('role_inherits → g line with "*" domain', async () => {
    const { adapter } = makeAdapter(() => [{ childId: 'r2', parentId: 'r1' }]);
    const lines = await adapter['queryRoleInherits']();
    expect(lines).toEqual(['g, Role_r2, Role_r1, *']);
  });

  test('resource_inherits → g4 line (child, parent codes)', async () => {
    const { adapter } = makeAdapter(() => [{ childCode: 'OrderItem', parentCode: 'Order' }]);
    const lines = await adapter['queryResourceInherits']();
    expect(lines).toEqual(['g4, OrderItem, Order']);
  });

  test('action_inherits → g5 line', async () => {
    const { adapter } = makeAdapter(() => [{ childCode: 'read', parentCode: 'manage' }]);
    const lines = await adapter['queryActionInherits']();
    expect(lines).toEqual(['g5, read, manage']);
  });

  test('domain_inherits → g3 line (typed child/parent)', async () => {
    const { adapter } = makeAdapter(() => [
      { childType: 'Branch', childId: '1', parentType: 'Company', parentId: '2' },
    ]);
    const lines = await adapter['queryDomainInherits']();
    expect(lines).toEqual(['g3, Branch_1, Company_2']);
  });
});

describe('scoped-adapter-edges — structural trees', () => {
  test('queries all four hierarchy tables every call (no caching)', async () => {
    let queryCalls = 0;
    const { adapter } = makeAdapter(() => {
      queryCalls += 1;
      return [];
    });

    await adapter['loadStructuralTrees']();
    expect(queryCalls).toBe(4); // role/resource/action/domain inherits
    await adapter['loadStructuralTrees']();
    expect(queryCalls).toBe(8); // read fresh again — no cache
  });

  test('a failed fetch propagates and a later call retries cleanly', async () => {
    let shouldFail = true;
    const { adapter } = makeAdapter(() => {
      if (shouldFail) {
        throw new Error('db down');
      }
      return [];
    });

    let firstError: unknown;
    try {
      await adapter['loadStructuralTrees']();
    } catch (err) {
      firstError = err;
    }
    expect(firstError).toBeDefined();

    shouldFail = false;
    expect(await adapter['loadStructuralTrees']()).toEqual([]);
  });
});

describe('scoped-adapter-edges — loadFilteredPolicy role-closure wiring', () => {
  test('role grant for a transitive PARENT role (via role_inherits) is loaded for the user', async () => {
    // User u1 assigned Role_child; Role_child inherits Role_parent (role_inherits edge).
    // Only Role_parent holds the grant → the closure must include the parent so its grant loads.
    const queriedSubjectIds: string[] = [];
    const { adapter } = makeAdapter((_text, params) => {
      if (params.includes('assign_role')) {
        return [{ roleId: 'child', domain: null }];
      }
      if (params.includes('role_inherits')) {
        return [{ childId: 'child', parentId: 'parent' }];
      }
      if (params.includes('grant') && params.includes('Role')) {
        // Record which role ids the grant query was scoped to.
        for (const p of params) {
          if (p === 'child' || p === 'parent') {
            queriedSubjectIds.push(String(p));
          }
        }
        return [
          { subjectId: 'parent', objectCode: 'Order', action: 'read', effect: null, domain: null },
        ];
      }
      return [];
    });

    const { newModelFromString } = await import('casbin');
    const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);

    await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 'u1' } });

    // The grant query must have been scoped to BOTH child and parent (closure expansion).
    expect(new Set(queriedSubjectIds)).toEqual(new Set(['child', 'parent']));

    // The parent's grant line is present in the loaded model.
    const policy = model.model.get('p')?.get('p')?.policy;
    expect(policy?.some(rule => rule.includes('Role_parent') && rule.includes('Order'))).toBe(true);
  });
});
