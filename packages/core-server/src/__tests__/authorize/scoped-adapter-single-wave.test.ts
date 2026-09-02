import { beforeEach, describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Model } from 'casbin';
import type {
  TPrincipalPolicyRow,
  ScopedCasbinAdapter as TScopedCasbinAdapter,
} from '@/components/auth/authorize/adapters/scoped-casbin';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin';
import type {
  ICasbinPolicySource,
  IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/types';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';

const dialect = new PgDialect();

const entities = (opts: { metadataColumnName?: string } = {}): IScopedCasbinEntities => ({
  policyDefinition: {
    tableName: 'PolicyDefinition',
    schemaName: 'identity',
    metadata: opts.metadataColumnName ? { columnName: opts.metadataColumnName } : undefined,
  },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

// One row per branch (direct, roleEdge, roleGrant), in the order the outer UNION ALL emits them.
const PRINCIPAL_POLICY_ROWS: TPrincipalPolicyRow[] = [
  {
    kind: 'direct',
    variant: 'assign_role',
    subjectId: 'u1',
    targetType: 'Role',
    targetId: 'r1',
    action: null,
    effect: null,
    domain: null,
    objectCode: null,
    objectSubject: null,
    objectMethod: null,
  },
  {
    kind: 'roleEdge',
    variant: 'role_inherits',
    subjectId: 'r1',
    targetType: 'Role',
    targetId: 'r2',
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
    subjectId: 'r2',
    targetType: null,
    targetId: 'p1',
    action: 'read',
    effect: 'allow',
    domain: null,
    objectCode: 'Order',
    objectSubject: 'Order',
    objectMethod: 'find',
  },
];

describe('ScopedCasbinAdapter - queryPrincipalPolicies', () => {
  let adapter: TScopedCasbinAdapter;
  let executeCalls = 0;
  let capturedStatement = '';

  // Stub connector - branches on statement text (WITH RECURSIVE vs anything else) and captures text plus params so assertions can check literal and parameterized fragments alike.
  const buildAdapter = (opts: { metadataColumnName?: string } = {}): TScopedCasbinAdapter => {
    executeCalls = 0;
    capturedStatement = '';

    const connector = {
      execute: async (query: SQL) => {
        executeCalls += 1;
        const { sql: text, params } = dialect.sqlToQuery(query);
        capturedStatement = `${text} ${JSON.stringify(params)}`;
        const rows = text.includes('WITH RECURSIVE') ? PRINCIPAL_POLICY_ROWS : [];
        return { rows };
      },
    };

    // `'metadataColumnName' in opts` distinguishes "not passed" (default 'metadata') from "explicitly undefined" - `??` alone cannot tell those apart.
    const metadataColumnName = 'metadataColumnName' in opts ? opts.metadataColumnName : 'metadata';
    const dataSource = { connector } as ICasbinPolicySource;
    return new ScopedCasbinAdapter({
      dataSource,
      entities: entities({ metadataColumnName }),
    });
  };

  const getExecuteCalls = (): number => executeCalls;

  beforeEach(() => {
    adapter = buildAdapter();
  });

  it('issues exactly one statement', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(getExecuteCalls()).toBe(1);
  });

  it('emits WITH RECURSIVE and a UNION in the recursive term, not UNION ALL', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    // UNION (not UNION ALL) in the recursive term is what terminates a cyclic role graph.
    expect(capturedStatement).toContain('WITH RECURSIVE');
    expect(capturedStatement).toMatch(/UNION\s+SELECT/);
  });

  it('filters the direct branch to the three per-principal variants', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain('assign_role');
    expect(capturedStatement).toContain('join_domain');
    expect(capturedStatement).toContain('grant');
  });

  it('LEFT JOINs Permission so a dangling target is visible rather than dropped', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain('LEFT JOIN');
    expect(capturedStatement).not.toContain('INNER JOIN');
  });

  it('restricts join_domain rows to the configured domain types', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain('Merchant');
  });

  it('returns the rows the driver produced, unchanged', async () => {
    const rows = await adapter['queryPrincipalPolicies']({
      principal: { type: 'User', id: 'u1' },
    });

    expect(rows.map(row => row.kind)).toEqual(['direct', 'roleEdge', 'roleGrant']);
  });

  it('omits the metadata column when metadataColumnName is not mapped', async () => {
    const bare = buildAdapter({ metadataColumnName: undefined });
    await bare['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).not.toContain('metadata');
  });
});

// Properties 1/2/4/5 are shape-verified: a stub returns canned rows regardless of what a real recursive CTE would compute, so only the SQL text that WOULD produce them can be checked here.
// Property 6 (g4/g5 unchanged) is covered unedited in scoped-adapter-edges.test.ts.
describe('ScopedCasbinAdapter - queryPrincipalPolicies domain_closure shape', () => {
  let adapter: TScopedCasbinAdapter;
  let capturedStatement = '';

  const buildAdapter = (): TScopedCasbinAdapter => {
    capturedStatement = '';
    const connector = {
      execute: async (query: SQL) => {
        const { sql: text, params } = dialect.sqlToQuery(query);
        capturedStatement = `${text} ${JSON.stringify(params)}`;
        return { rows: [] };
      },
    };
    const dataSource = { connector } as ICasbinPolicySource;
    return new ScopedCasbinAdapter({ dataSource, entities: entities() });
  };

  beforeEach(() => {
    adapter = buildAdapter();
  });

  it('adds a second CTE, domain_closure, alongside role_closure under one WITH RECURSIVE', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain('role_closure');
    expect(capturedStatement).toContain('domain_closure');
    // Exactly one WITH RECURSIVE - both closures share it via a comma-separated CTE list.
    expect(capturedStatement.match(/WITH RECURSIVE/g)?.length).toBe(1);
  });

  it('seeds domain_closure from the principal join_domain rows (dom_type/dom_id)', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain('dom_type');
    expect(capturedStatement).toContain('dom_id');
    expect(capturedStatement).toContain('join_domain');
  });

  it('recurses domain_closure up the parent chain via domain_inherits, joined on the closure itself', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain('domain_closure.dom_type');
    expect(capturedStatement).toContain('domain_closure.dom_id');
    expect(capturedStatement).toContain('domain_inherits');
  });

  it('uses UNION (not UNION ALL) in the domain_closure recursive term - terminates a cyclic domain graph', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    // Two recursive terms overall (role_closure + domain_closure), both plain UNION.
    expect(capturedStatement.match(/UNION\s+SELECT/g)?.length).toBe(2);
  });

  it('the domainEdge branch is joined against domain_closure - it cannot select an edge outside the closure', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    // The kind discriminant is a bound parameter, so load-scoping is proven by the branch's FROM/JOIN rather than a bare WHERE: no unconditional "FROM policyDefinition WHERE variant = domain_inherits" is left un-joined.
    expect(capturedStatement).toMatch(
      /JOIN domain_closure ON policyDefinition\.subject_type = domain_closure\.dom_type/,
    );
  });

  it('assembles the domainEdge child/parent tokens into the subjectId/targetId columns', async () => {
    await adapter['queryPrincipalPolicies']({ principal: { type: 'User', id: 'u1' } });

    expect(capturedStatement).toContain(
      'policyDefinition.subject_type || \'_\' || policyDefinition.subject_id::text AS "subjectId"',
    );
    expect(capturedStatement).toContain(
      'policyDefinition.target_type || \'_\' || policyDefinition.target_id::text AS "targetId"',
    );
  });
});

// Property 3 (sibling isolation) and the g3 emission itself, line-verified: given rows a correctly scoped closure WOULD produce, loadFilteredPolicy must turn each 'domainEdge' row into exactly one g3 line and fabricate none for an edge never returned.
describe('ScopedCasbinAdapter - domainEdge rows become g3 lines', () => {
  const buildAdapterWithRows = (rows: TPrincipalPolicyRow[]): TScopedCasbinAdapter => {
    const connector = {
      execute: async (query: SQL) => {
        const { sql: text } = dialect.sqlToQuery(query);
        return { rows: text.includes('WITH RECURSIVE') ? rows : [] };
      },
    };
    const dataSource = { connector } as ICasbinPolicySource;
    return new ScopedCasbinAdapter({ dataSource, entities: entities() });
  };

  const domainEdgeRow = (opts: { subjectId: string; targetId: string }): TPrincipalPolicyRow => ({
    kind: 'domainEdge',
    variant: 'domain_inherits',
    subjectId: opts.subjectId,
    targetType: null,
    targetId: opts.targetId,
    action: null,
    effect: null,
    domain: null,
    objectCode: null,
    objectSubject: null,
    objectMethod: null,
  });

  const capturedLinesFor = async (rows: TPrincipalPolicyRow[]): Promise<string[]> => {
    const adapter = buildAdapterWithRows(rows);
    let captured: string[] = [];
    adapter['loadLines'] = async (opts: { model: Model; lines: string[] }): Promise<void> => {
      captured = opts.lines;
    };
    const { newModelFromString } = await import('casbin');
    const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
    await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 'u1' } });
    return captured;
  };

  it('seed + one hop: Merchant_9 -> Organizer_X emits g3, Merchant_9, Organizer_X', async () => {
    const lines = await capturedLinesFor([
      domainEdgeRow({ subjectId: 'Merchant_9', targetId: 'Organizer_X' }),
    ]);

    expect(lines).toContain('g3, Merchant_9, Organizer_X');
  });

  it('multi-hop: Merchant_9 -> Organizer_X -> Region_1 emits both edges', async () => {
    const lines = await capturedLinesFor([
      domainEdgeRow({ subjectId: 'Merchant_9', targetId: 'Organizer_X' }),
      domainEdgeRow({ subjectId: 'Organizer_X', targetId: 'Region_1' }),
    ]);

    expect(lines).toContain('g3, Merchant_9, Organizer_X');
    expect(lines).toContain('g3, Organizer_X, Region_1');
  });

  it('sibling isolation: an edge the closure never returned is never emitted', async () => {
    // What a correctly-scoped closure returns for a principal in Merchant_9 only - the unrelated Merchant_8 -> Organizer_Y edge is absent because the CTE never reaches it.
    const lines = await capturedLinesFor([
      domainEdgeRow({ subjectId: 'Merchant_9', targetId: 'Organizer_X' }),
    ]);

    expect(lines).toContain('g3, Merchant_9, Organizer_X');
    expect(lines).not.toContain('g3, Merchant_8, Organizer_Y');
  });

  it('emits nothing for domainEdge when the closure has no rows to give', async () => {
    const lines = await capturedLinesFor([]);

    expect(lines.filter(line => line.startsWith('g3,'))).toEqual([]);
  });
});

// One row per branch the outer UNION ALL can produce for one loadFilteredPolicy call: the principal's own edges, one reachable role_inherits edge, and the role closure's grant. No unreachable role edge - the recursive CTE would never return one.
const SINGLE_WAVE_ROWS: TPrincipalPolicyRow[] = [
  {
    kind: 'direct',
    variant: 'assign_role',
    subjectId: 'u1',
    targetType: 'Role',
    targetId: 'r1',
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
    targetId: 'm1',
    action: null,
    effect: null,
    domain: null,
    objectCode: null,
    objectSubject: null,
    objectMethod: null,
  },
  {
    kind: 'direct',
    variant: 'grant',
    subjectId: 'u1',
    targetType: null,
    targetId: 'p1',
    action: 'read',
    effect: null,
    domain: null,
    objectCode: 'Order.find',
    objectSubject: 'Order',
    objectMethod: 'find',
  },
  {
    kind: 'roleEdge',
    variant: 'role_inherits',
    subjectId: 'r1',
    targetType: 'Role',
    targetId: 'r2',
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
    subjectId: 'r2',
    targetType: null,
    targetId: 'p2',
    action: 'read',
    effect: null,
    domain: null,
    objectCode: 'Invoice.find',
    objectSubject: 'Invoice',
    objectMethod: 'find',
  },
];

describe('ScopedCasbinAdapter - loadFilteredPolicy issues one wave', () => {
  let adapter: TScopedCasbinAdapter;
  let model: Model;
  let executeCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let captured: string[] = [];

  beforeEach(async () => {
    executeCalls = 0;
    inFlight = 0;
    maxInFlight = 0;
    captured = [];

    const connector = {
      execute: async (query: SQL) => {
        executeCalls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Yields so every statement in the wave counts as in-flight before any resolves, as a real round-trip does; a query chained onto a previous one's result never would.
        await Promise.resolve();
        const { sql: text } = dialect.sqlToQuery(query);
        const rows = text.includes('WITH RECURSIVE') ? SINGLE_WAVE_ROWS : [];
        inFlight -= 1;
        return { rows };
      },
    };

    const dataSource = { connector } as ICasbinPolicySource;
    adapter = new ScopedCasbinAdapter({ dataSource, entities: entities() });
    adapter['loadLines'] = async (opts: { model: Model; lines: string[] }): Promise<void> => {
      captured = opts.lines;
    };

    const { newModelFromString } = await import('casbin');
    model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
  });

  const getExecuteCalls = (): number => executeCalls;
  const getMaxConcurrentInFlight = (): number => maxInFlight;
  const capturedLines = async (): Promise<string[]> => {
    await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 'u1' } });
    return captured;
  };

  it('issues exactly two statements', async () => {
    await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 'u1' } });

    expect(getExecuteCalls()).toBe(2);
  });

  it('issues them concurrently - none waits for another to resolve', async () => {
    // Every statement must be in flight before the first resolves, or a wave has crept back in.
    await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 'u1' } });

    expect(getMaxConcurrentInFlight()).toBe(2);
  });

  it('emits a g line per reachable role edge and none for unreachable ones', async () => {
    const lines = await capturedLines();

    expect(lines).toContain('g, Role_r1, Role_r2, *');
    expect(lines).not.toContain('g, Role_unrelated, Role_other, *');
  });

  it('emits g lines for assignments, g2 for memberships and p for both grant sources', async () => {
    const lines = await capturedLines();

    expect(lines).toContain('g, User_u1, Role_r1, *');
    expect(lines).toContain('g2, User_u1, Merchant_m1');
    expect(lines).toContain('p, User_u1, ANY_MEMBER, Order.find, read, allow');
    expect(lines).toContain('p, Role_r2, ANY_MEMBER, Invoice.find, read, allow');
  });

  it('has no structural cache surface left', () => {
    expect(
      (adapter as unknown as Record<string, unknown>).invalidateStructuralCache,
    ).toBeUndefined();
  });
});
