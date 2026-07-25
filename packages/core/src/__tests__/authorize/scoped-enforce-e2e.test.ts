import { describe, expect, test } from 'bun:test';
import { asTypedContext } from '@/base/controllers/common/types';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { CasbinEnforcerModelDrivers } from '@/components/auth/authorize/common/constants';
import type { FilteredAdapter, Model } from 'casbin';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import type { IScopedCasbinEntities } from '@/components/auth/authorize/adapters/types';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

// Adapter that loads a fixed set of scoped lines for any filter.
class FixedScopedAdapter implements FilteredAdapter {
  constructor(private lines: string[]) {}
  async loadPolicy(): Promise<void> {}
  async loadFilteredPolicy(model: Model): Promise<void> {
    const { Helper } = await import('casbin');
    for (const l of this.lines) {
      Helper.loadPolicyLine(l, model);
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

function scopedEnforcer(lines: string[]) {
  return new CasbinAuthorizationEnforcer({
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    adapter: new FixedScopedAdapter(lines),
    isScoped: true,
  });
}

describe('CasbinAuthorizationEnforcer — scoped matchers', () => {
  test('configure registers g(keyMatch) and g4(objectMatch): endpoint matches subject grant', async () => {
    const e = scopedEnforcer([
      'g, User_1, Role_v, *',
      'g2, User_1, Merchant_7',
      'p, Role_v, ANY_MEMBER, Activation, read, allow',
    ]);
    await e.configure();
    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 1 },
      context: asTypedContext({}),
    });

    const decision = await e.evaluate({
      rules,
      request: { resource: 'Activation.findById', action: 'read', domain: 'Merchant_7' },
      context: asTypedContext({}),
    });
    expect(decision).toBe('allow');
  });

  test('scoped enforce with NO request domain defaults to SYSTEM_WIDE (only super-admin passes)', async () => {
    // Super-admin holds a SYSTEM_WIDE grant → allowed even on a domain-less request.
    const superE = scopedEnforcer([
      'g, User_1, Role_super, *',
      'p, Role_super, SYSTEM_WIDE, *, manage, allow',
      'g5, read, manage',
    ]);
    await superE.configure();
    const superRules = await superE.buildRules({
      user: { principalType: 'User', userId: 1 },
      context: asTypedContext({}),
    });
    const superDecision = await superE.evaluate({
      rules: superRules,
      request: { resource: 'Order', action: 'read' }, // no domain → defaults to SYSTEM_WIDE
      context: asTypedContext({}),
    });
    expect(superDecision).toBe('allow');

    // An ANY_MEMBER operator is correctly DENIED on a domain-less request.
    const memberE = scopedEnforcer([
      'g, User_2, Role_op, *',
      'g2, User_2, Merchant_7',
      'p, Role_op, ANY_MEMBER, Order, read, allow',
    ]);
    await memberE.configure();
    const memberRules = await memberE.buildRules({
      user: { principalType: 'User', userId: 2 },
      context: asTypedContext({}),
    });
    const memberDecision = await memberE.evaluate({
      rules: memberRules,
      request: { resource: 'Order', action: 'read' }, // no domain → SYSTEM_WIDE → only super-admin grants match
      context: asTypedContext({}),
    });
    expect(memberDecision).toBe('deny');
  });

  // The current setNamedRoleManager wiring and the prior addNamedMatchingFunc wiring are behaviorally identical, so only timing distinguishes them - this is the production-path detector for that regression.
  test('production wiring stays fast on an incident-shaped policy set (perf regression guard)', async () => {
    const moduleCount = 6;
    const subjectsPerModule = 20; // 6 * 20 = 120 subjects, one g4 edge each
    const operationsPerSubject = 8;
    const lines: string[] = [];

    for (let moduleIndex = 0; moduleIndex < moduleCount; moduleIndex++) {
      for (let subjectIndex = 0; subjectIndex < subjectsPerModule; subjectIndex++) {
        const resourceCode = `Module${moduleIndex}.Resource${subjectIndex}`;
        const grantTarget = `Grant${moduleIndex}_${subjectIndex}`;
        lines.push(`g4, ${resourceCode}, ${grantTarget}`);
        lines.push(
          ...Array.from(
            { length: operationsPerSubject },
            (_unused, operationIndex) =>
              `p, Role_1, ANY_MEMBER, ${grantTarget}, op${operationIndex}, allow`,
          ),
        );
      }
    }

    for (let actionIndex = 0; actionIndex < 6; actionIndex++) {
      lines.push(`g5, action${actionIndex}, manage`);
    }

    lines.push('g, User_1, Role_1, *');
    lines.push('g2, User_1, Merchant_1');

    const e = scopedEnforcer(lines);
    await e.configure();
    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 1 },
      context: asTypedContext({}),
    });

    const request = { resource: 'Module3.Resource10.execute', action: 'op5', domain: 'Merchant_1' };

    const decision = await e.evaluate({ rules, request, context: asTypedContext({}) });
    expect(decision).toBe('allow');

    const sampleCount = 20;
    const durations: number[] = [];
    for (let index = 0; index < sampleCount; index++) {
      const start = performance.now();
      await e.evaluate({ rules, request, context: asTypedContext({}) });
      durations.push(performance.now() - start);
    }
    const averageMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;

    // Measured ~37ms under the current wiring against ~1800ms with the reverted wiring; the threshold is ~10x the measured average, still well under the reverted cost.
    expect(averageMs).toBeLessThan(400);
  });
});

const dialect = new PgDialect();

// Branch on PARAMS — Drizzle parameterizes the variant value ($1), it is NOT in the SQL text.
function dbAdapter(rowsFor: (sqlText: string, params: unknown[]) => unknown[]) {
  const connector = {
    execute: async (q: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(q);
      return { rows: rowsFor(text, params) };
    },
  };
  const entities: IScopedCasbinEntities = {
    policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
    permission: { tableName: 'Permission', schemaName: 'identity' },
    principals: { user: 'User', role: 'Role' },
    domainTypes: ['Merchant', 'Organizer'],
    softDelete: { use: true, columnName: 'deleted_at' },
  };
  return new ScopedCasbinAdapter({
    // The adapter only ever calls `.execute`, so the stub implements only that out of drizzle's full generated node-postgres type.
    dataSource: { connector } as any,
    entities,
  });
}

describe('scoped RBAC — full stack (adapter + enforcer + evaluate)', () => {
  test('member operator allowed on joined shop, denied elsewhere', async () => {
    // The single recursive CTE returns everything scoped to u1, so the three structural-tree queries fall through to the empty default. Role grants only - 'u1' has no direct grant.
    const adapter = dbAdapter(text => {
      if (text.includes('WITH RECURSIVE')) {
        return [
          {
            kind: 'direct',
            variant: 'assign_role',
            subjectId: 'u1',
            targetType: 'Role',
            targetId: 'op',
            action: null,
            effect: null,
            domain: null,
            objectCode: null,
            objectSubject: null,
            objectMethod: null,
          },
          {
            kind: 'direct',
            variant: 'join_domain',
            subjectId: 'u1',
            targetType: 'Merchant',
            targetId: '7',
            action: null,
            effect: null,
            domain: null,
            objectCode: null,
            objectSubject: null,
            objectMethod: null,
          },
          {
            kind: 'roleGrant',
            variant: 'grant',
            subjectId: 'op',
            targetType: null,
            targetId: 'p1',
            action: 'read',
            effect: null,
            domain: null,
            objectCode: 'Order',
            objectSubject: 'Order',
            objectMethod: 'find',
          },
        ];
      }

      return [];
    });

    const e = new CasbinAuthorizationEnforcer({
      model: {
        driver: CasbinEnforcerModelDrivers.TEXT,
        definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
      },
      cached: { use: false },
      adapter,
      isScoped: true,
    });
    await e.configure();
    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 'u1' },
      context: asTypedContext({}),
    });

    const allow = await e.evaluate({
      rules,
      request: { resource: 'Order', action: 'read', domain: 'Merchant_7' },
      context: asTypedContext({}),
    });
    const deny = await e.evaluate({
      rules,
      request: { resource: 'Order', action: 'read', domain: 'Merchant_99' },
      context: asTypedContext({}),
    });

    expect(allow).toBe('allow');
    expect(deny).toBe('deny');
  });
});

describe('scoped + redis cache — cached payload completeness', () => {
  test('miss caches ALL line types (g/g4/g2/p); a subsequent cache HIT still enforces correctly', async () => {
    const store = new Map<string, string>();
    const client = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
        return 'OK';
      },
      del: async (...ks: string[]) => ks.reduce((n, k) => n + (store.delete(k) ? 1 : 0), 0),
    };

    const adapter = new FixedScopedAdapter([
      'g, User_1, Role_v, *',
      'g2, User_1, Merchant_7',
      'g4, OrderItem, Order',
      'p, Role_v, ANY_MEMBER, Order, read, allow',
    ]);

    const enforcer = new CasbinAuthorizationEnforcer({
      model: {
        driver: CasbinEnforcerModelDrivers.TEXT,
        definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
      },
      adapter,
      isScoped: true,
      cached: {
        use: true,
        driver: 'redis',
        options: {
          connection: {
            getClient: () => client,
            get: ({ key }: { key: string }) => client.get(key),
            set: ({ key, value }: { key: string; value: unknown }) =>
              client.set(key, JSON.stringify(value)),
            del: ({ keys }: { keys: string[] }) => client.del(...keys),
            // This fixture only exercises get/set/del out of IRedisHelper's dozens of methods.
          } as any,
          expiresIn: 60_000,
          keyFn: ({ user }) => `casbin:User:${user.userId}`,
        },
      },
    });
    await enforcer.configure();

    // First build → cache miss → writes the cache.
    await enforcer.buildRules({
      user: { principalType: 'User', userId: 1 },
      context: asTypedContext({}),
    });

    const cached = JSON.parse(store.get('casbin:User:1') ?? 'null') as string[];
    // Completeness: membership (g2) and the resource edge (g4) MUST survive the cache round-trip.
    expect(cached).toContain('g2, User_1, Merchant_7');
    expect(cached).toContain('g4, OrderItem, Order');
    expect(cached.some(line => line.startsWith('p,'))).toBe(true);

    // Second build → cache HIT → enforce nested resource (OrderItem ⊂ Order via g4) in member domain.
    const rules = await enforcer.buildRules({
      user: { principalType: 'User', userId: 1 },
      context: asTypedContext({}),
    });
    const decision = await enforcer.evaluate({
      rules,
      request: { resource: 'OrderItem', action: 'read', domain: 'Merchant_7' },
      context: asTypedContext({}),
    });
    expect(decision).toBe('allow');
  });
});

describe('scoped RBAC — explicit deny overrides allow (enforceExSync explain path)', () => {
  test('a user-level deny overrides a role allow → DENY (matched deny rule surfaced)', async () => {
    // Role grants read; an explicit user-level deny on the same resource must win (allow-and-deny).
    const e = scopedEnforcer([
      'g, User_1, Role_v, *',
      'g2, User_1, Merchant_7',
      'p, Role_v, ANY_MEMBER, Activation, read, allow',
      'p, User_1, ANY_MEMBER, Activation, read, deny',
    ]);
    await e.configure();
    const rules = await e.buildRules({
      user: { principalType: 'User', userId: 1 },
      context: asTypedContext({}),
    });

    const decision = await e.evaluate({
      rules,
      request: { resource: 'Activation', action: 'read', domain: 'Merchant_7' },
      context: asTypedContext({}),
    });

    // deny-override via casbin "allow-and-deny": the matched policy is the deny rule (non-empty explain).
    expect(decision).toBe('deny');
  });
});
