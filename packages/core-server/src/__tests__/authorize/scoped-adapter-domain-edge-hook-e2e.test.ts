import { describe, expect, test } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { asTypedContext } from '@venizia/ignis-kernel';
import { CasbinAuthorizationEnforcer } from '@/components/auth/authorize/enforcers/casbin.enforcer';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { AuthorizationDomainScopes, CasbinEnforcerModelDrivers } from '@venizia/ignis-kernel';
import type {
  TPrincipalPolicyRow,
  ScopedCasbinAdapter as TScopedCasbinAdapter,
} from '@/components/auth/authorize/adapters/scoped-casbin';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin';
import type {
  ICasbinPolicySource,
  IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/types';

const dialect = new PgDialect();

const entities = (): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

// A role assigned at the parent Organizer_A, plus the SAME role's grant, also carrying domain Organizer_A.
// Neither row ever mentions Merchant_new - the only way it becomes reachable is a g3 edge to Organizer_A.
const rowsFor = (opts: { includeTableDomainEdge: boolean }): TPrincipalPolicyRow[] => {
  const rows: TPrincipalPolicyRow[] = [
    {
      kind: 'direct',
      variant: 'assign_role',
      subjectId: 'u1',
      targetType: 'Role',
      targetId: 'v',
      action: null,
      effect: null,
      domain: 'Organizer_A',
      objectCode: null,
      objectSubject: null,
      objectMethod: null,
    },
    {
      kind: 'roleGrant',
      variant: 'grant',
      subjectId: 'v',
      targetType: null,
      targetId: 'p1',
      action: 'read',
      effect: 'allow',
      domain: 'Organizer_A',
      objectCode: 'Activation',
      objectSubject: 'Activation',
      objectMethod: 'find',
    },
  ];

  if (opts.includeTableDomainEdge) {
    // A genuine domain_inherits row for the SAME edge the hook also returns - proves the duplicate is harmless.
    rows.push({
      kind: 'domainEdge',
      variant: 'domain_inherits',
      subjectId: 'Merchant_new',
      targetType: null,
      targetId: 'Organizer_A',
      action: null,
      effect: null,
      domain: null,
      objectCode: null,
      objectSubject: null,
      objectMethod: null,
    });
  }

  return rows;
};

const buildScopedAdapter = (opts: {
  rows: TPrincipalPolicyRow[];
  resolveDomainEdges?: ConstructorParameters<typeof ScopedCasbinAdapter>[0]['resolveDomainEdges'];
}): TScopedCasbinAdapter => {
  const connector = {
    execute: async (query: SQL) => {
      const { sql: text } = dialect.sqlToQuery(query);
      return { rows: text.includes('WITH RECURSIVE') ? opts.rows : [] };
    },
  };
  const dataSource = { connector } as ICasbinPolicySource;
  return new ScopedCasbinAdapter({
    dataSource,
    entities: entities(),
    resolveDomainEdges: opts.resolveDomainEdges,
  });
};

const decide = async (opts: {
  enforcer: CasbinAuthorizationEnforcer;
  domain: string;
}): Promise<string> => {
  const { enforcer, domain } = opts;
  const rules = await enforcer.buildRules({
    user: { principalType: 'User', userId: 1 },
    context: asTypedContext({}),
  });
  return enforcer.evaluate({
    rules,
    request: { resource: 'Activation', action: 'read', domain },
    context: asTypedContext({}),
  });
};

// The g-axis domain-hierarchy addon and the shared overlay Map are wired unconditionally for every
// isScoped model (see registerMatchers in casbin.enforcer.ts) - that wiring, not the hook itself,
// is what lets a g3 line reach the role (g) axis.
const buildEnforcer = (opts: {
  resolveDomainEdges?: ConstructorParameters<typeof ScopedCasbinAdapter>[0]['resolveDomainEdges'];
  includeTableDomainEdge?: boolean;
}): CasbinAuthorizationEnforcer =>
  new CasbinAuthorizationEnforcer({
    model: { driver: CasbinEnforcerModelDrivers.TEXT, definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL },
    cached: { use: false },
    adapter: buildScopedAdapter({
      rows: rowsFor({ includeTableDomainEdge: opts.includeTableDomainEdge ?? false }),
      resolveDomainEdges: opts.resolveDomainEdges,
    }),
    isScoped: true,
  });

describe('resolveDomainEdges e2e - grant axis (g3)', () => {
  test('a grant carrying domain Organizer_A applies at Merchant_new purely via a hook-supplied g3 edge', async () => {
    const withoutHook = buildEnforcer({});
    await withoutHook.configure();
    expect(await decide({ enforcer: withoutHook, domain: 'Merchant_new' })).toBe('deny');

    const withHook = buildEnforcer({
      resolveDomainEdges: async () => [{ child: 'Merchant_new', parent: 'Organizer_A' }],
    });
    await withHook.configure();
    expect(await decide({ enforcer: withHook, domain: 'Merchant_new' })).toBe('allow');
  });
});

describe('resolveDomainEdges e2e - role axis (g), via the overlay shared across role managers', () => {
  test('a role assigned at Organizer_A cascades to Merchant_new only when the hook supplies the g3 edge', async () => {
    // Same fixture, but the grant is SYSTEM_WIDE and reached only through the role (g) axis cascading
    // the assignment from Organizer_A down to Merchant_new - the grant axis plays no part here.
    const rows: TPrincipalPolicyRow[] = [
      {
        kind: 'direct',
        variant: 'assign_role',
        subjectId: 'u1',
        targetType: 'Role',
        targetId: 'v',
        action: null,
        effect: null,
        domain: 'Organizer_A',
        objectCode: null,
        objectSubject: null,
        objectMethod: null,
      },
      {
        kind: 'roleGrant',
        variant: 'grant',
        subjectId: 'v',
        targetType: null,
        targetId: 'p1',
        action: 'read',
        effect: 'allow',
        domain: AuthorizationDomainScopes.SYSTEM_WIDE,
        objectCode: 'Activation',
        objectSubject: 'Activation',
        objectMethod: 'find',
      },
    ];

    const enforcerWithoutHook = new CasbinAuthorizationEnforcer({
      model: {
        driver: CasbinEnforcerModelDrivers.TEXT,
        definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
      },
      cached: { use: false },
      adapter: buildScopedAdapter({ rows }),
      isScoped: true,
    });
    await enforcerWithoutHook.configure();
    expect(await decide({ enforcer: enforcerWithoutHook, domain: 'Merchant_new' })).toBe('deny');

    const enforcerWithHook = new CasbinAuthorizationEnforcer({
      model: {
        driver: CasbinEnforcerModelDrivers.TEXT,
        definition: CASBIN_RBAC_DOMAIN_SCOPED_MODEL,
      },
      cached: { use: false },
      adapter: buildScopedAdapter({
        rows,
        resolveDomainEdges: async () => [{ child: 'Merchant_new', parent: 'Organizer_A' }],
      }),
      isScoped: true,
    });
    await enforcerWithHook.configure();
    expect(await decide({ enforcer: enforcerWithHook, domain: 'Merchant_new' })).toBe('allow');
  });
});

describe('resolveDomainEdges e2e - duplicate edges', () => {
  test('the same child->parent edge from both the hook and a real domain_inherits row still decides correctly', async () => {
    const enforcer = buildEnforcer({
      includeTableDomainEdge: true,
      resolveDomainEdges: async () => [{ child: 'Merchant_new', parent: 'Organizer_A' }],
    });
    await enforcer.configure();

    expect(await decide({ enforcer, domain: 'Merchant_new' })).toBe('allow');
    // Sibling domain never linked to Organizer_A by either source - must stay denied.
    expect(await decide({ enforcer, domain: 'Merchant_untouched' })).toBe('deny');
  });
});
