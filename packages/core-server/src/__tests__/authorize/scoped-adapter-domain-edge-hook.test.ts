import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Model } from 'casbin';
import type {
  TPrincipalPolicyRow,
  ScopedCasbinAdapter as TScopedCasbinAdapter,
} from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import type {
  ICasbinPolicySource,
  IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/types';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import type { ILogger } from '@venizia/ignis-helpers/core';

const dialect = new PgDialect();

const entities = (): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

// A join_domain seed (Merchant_9) plus one domain_inherits edge reachable from it (Merchant_9 -> Organizer_B) -
// exactly what queryPrincipalPolicies would return for a principal joined at Merchant_9 whose table already
// carries that one ancestor edge.
const ROWS_WITH_CLOSURE: TPrincipalPolicyRow[] = [
  {
    kind: 'direct',
    variant: 'join_domain',
    subjectId: 'u1',
    targetType: 'Merchant',
    targetId: '9',
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
    effect: 'allow',
    domain: null,
    objectCode: 'Order.find',
    objectSubject: 'Order',
    objectMethod: 'find',
  },
  {
    kind: 'domainEdge',
    variant: 'domain_inherits',
    subjectId: 'Merchant_9',
    targetType: null,
    targetId: 'Organizer_B',
    action: null,
    effect: null,
    domain: null,
    objectCode: null,
    objectSubject: null,
    objectMethod: null,
  },
];

const buildAdapter = (opts: {
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

const capturedLinesFor = async (adapter: TScopedCasbinAdapter): Promise<string[]> => {
  let captured: string[] = [];
  adapter['loadLines'] = async (loadOpts: { model: Model; lines: string[] }): Promise<void> => {
    captured = loadOpts.lines;
  };
  const { newModelFromString } = await import('casbin');
  const model = newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL);
  await adapter.loadFilteredPolicy(model, { principal: { type: 'User', id: 'u1' } });
  return captured;
};

describe('ScopedCasbinAdapter - resolveDomainEdges absent', () => {
  it('emits no g3 line beyond what the table rows already produce', async () => {
    const adapter = buildAdapter({ rows: ROWS_WITH_CLOSURE });
    const lines = await capturedLinesFor(adapter);

    const g3Lines = lines.filter(line => line.startsWith('g3,'));
    expect(g3Lines).toEqual(['g3, Merchant_9, Organizer_B']);
  });
});

describe('ScopedCasbinAdapter - resolveDomainEdges supplied', () => {
  it("hook edges reach the model as g3 lines, using the hook's tokens verbatim", async () => {
    const adapter = buildAdapter({
      rows: ROWS_WITH_CLOSURE,
      resolveDomainEdges: async () => [{ child: 'Merchant_9', parent: 'Organizer_ROOT' }],
    });
    const lines = await capturedLinesFor(adapter);

    expect(lines).toContain('g3, Merchant_9, Organizer_ROOT');
  });

  it('receives the principal and its actual domain closure, not an empty array', async () => {
    let receivedPrincipal: { type: string; id: unknown } | undefined;
    let receivedDomains: string[] | undefined;

    const adapter = buildAdapter({
      rows: ROWS_WITH_CLOSURE,
      resolveDomainEdges: async hookOpts => {
        receivedPrincipal = hookOpts.principal;
        receivedDomains = hookOpts.domains;
        return [];
      },
    });
    await capturedLinesFor(adapter);

    expect(receivedPrincipal).toEqual({ type: 'User', id: 'u1' });
    expect(receivedDomains).toBeDefined();
    expect(receivedDomains).not.toEqual([]);
    // The join_domain seed (Merchant_9) and the table-sourced ancestor (Organizer_B) both belong
    // to the closure - the hook must see the whole thing, not just the seed.
    expect(receivedDomains).toContain('Merchant_9');
    expect(receivedDomains).toContain('Organizer_B');
  });

  it('a throwing hook is logged and does not abort the load - rows already gathered still produce their lines', async () => {
    const messages: string[] = [];
    const noop = (): void => {};
    const errorLogger: ILogger = {
      debug: noop,
      info: noop,
      warn: noop,
      error: (template: string, ...args: unknown[]): void => {
        messages.push(`${template} ${args.join(' ')}`);
      },
      emerg: noop,
      log: noop,
      for: () => errorLogger,
    };

    const adapter = buildAdapter({
      rows: ROWS_WITH_CLOSURE,
      resolveDomainEdges: async () => {
        throw new Error('tenant table unreachable');
      },
    });
    adapter.logger = errorLogger;

    const lines = await capturedLinesFor(adapter);

    // Everything gathered before the hook ran is intact: the membership line and the grant line.
    expect(lines).toContain('g2, User_u1, Merchant_9');
    expect(lines).toContain('p, User_u1, ANY_MEMBER, Order.find, read, allow');
    // The table-sourced g3 edge survives; only the hook's contribution for this call is missing.
    expect(lines).toContain('g3, Merchant_9, Organizer_B');

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(message => message.includes('resolveDomainEdges'))).toBe(true);
  });

  it('a hook edge duplicating a real domain_inherits row is harmless at the line level - both are emitted, neither corrupts the other', async () => {
    const adapter = buildAdapter({
      rows: ROWS_WITH_CLOSURE,
      resolveDomainEdges: async () => [{ child: 'Merchant_9', parent: 'Organizer_B' }],
    });
    const lines = await capturedLinesFor(adapter);

    const g3Lines = lines.filter(line => line === 'g3, Merchant_9, Organizer_B');
    expect(g3Lines.length).toBeGreaterThanOrEqual(1);
  });
});
