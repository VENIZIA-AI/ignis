import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { IdType } from '@/base';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import type {
  ICasbinPolicySource,
  IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/types';
import { AuthorizationPermissionBuilder } from '@venizia/ignis-kernel';
import { GrantBuilder } from '@venizia/ignis-kernel';
import { AuthorizationDomainScopes } from '@venizia/ignis-kernel';
import type { ILogger } from '@venizia/ignis-helpers/core';

const dialect = new PgDialect();
const grantBuilder = GrantBuilder.getInstance();

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

/** `buildGrantLines` takes fetched rows directly, so the only query left is the batched `queryOperationCatalog` lookup - the stub answers with `catalogRows` regardless of statement text. */
const makeAdapter = (
  opts: {
    catalogRows?: unknown[];
    metadataColumnName?: string;
  } = {},
) => {
  const { catalogRows = [] } = opts;
  let executeCalls = 0;
  const captured: string[] = [];
  const connector = {
    execute: async (query: SQL) => {
      executeCalls += 1;
      const { sql: text } = dialect.sqlToQuery(query);
      captured.push(text);
      return { rows: catalogRows };
    },
  };
  // The adapter only ever calls `.execute`, so the stub implements only that out of drizzle's full generated node-postgres type.
  const dataSource = { connector } as ICasbinPolicySource;
  const adapter = new ScopedCasbinAdapter({
    dataSource,
    entities: entities({ metadataColumnName: opts.metadataColumnName }),
  });
  return { adapter, captured, getExecuteCalls: () => executeCalls };
};

/** Fully implements ILogger (not a `.for()`-only partial) so no cast is needed to assign it. */
const makeCapturingLogger = (): { logger: ILogger; messages: string[] } => {
  const messages: string[] = [];
  const noop = (): void => {};
  const logger: ILogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: (template: string, ...args: unknown[]): void => {
      messages.push(`${template} ${args.join(' ')}`);
    },
    emerg: noop,
    log: noop,
    for: () => logger,
  };
  return { logger, messages };
};

describe('ScopedCasbinAdapter - custom operation-subset grants', () => {
  it('expands a custom row into one line per operation, each with its catalogued action', async () => {
    const { adapter } = makeAdapter({
      catalogRows: [
        { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
        { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
      ],
      metadataColumnName: 'metadata',
    });
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find', 'deleteById'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([
      'p, Role_r1, ANY_MEMBER, Order.find, read, allow',
      'p, Role_r1, ANY_MEMBER, Order.deleteById, delete, allow',
    ]);
  });

  it('produces exactly what the equivalent per-operation rows produce', async () => {
    const { adapter: customAdapter } = makeAdapter({
      catalogRows: [
        { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
        { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
      ],
      metadataColumnName: 'metadata',
    });
    const customRows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find', 'deleteById'] },
      },
    ];

    const { adapter: perOperationAdapter } = makeAdapter();
    const perOperationRows = [
      {
        subjectId: 'r1',
        objectCode: 'Order.find',
        objectSubject: 'Order',
        objectMethod: 'find',
        action: 'read',
        effect: null,
        domain: null,
      },
      {
        subjectId: 'r1',
        objectCode: 'Order.deleteById',
        objectSubject: 'Order',
        objectMethod: 'deleteById',
        action: 'delete',
        effect: null,
        domain: null,
      },
    ];

    const customLines = await customAdapter['buildGrantLines']({
      subjectType: 'Role',
      rows: customRows,
    });
    const perOperationLines = await perOperationAdapter['buildGrantLines']({
      subjectType: 'Role',
      rows: perOperationRows,
    });

    expect(customLines).toEqual(perOperationLines);
  });

  it('carries the row effect onto every emitted line', async () => {
    const { adapter } = makeAdapter({
      catalogRows: [
        { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
        { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
      ],
      metadataColumnName: 'metadata',
    });
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: 'deny',
        domain: null,
        metadata: { ops: ['find', 'deleteById'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([
      'p, Role_r1, ANY_MEMBER, Order.find, read, deny',
      'p, Role_r1, ANY_MEMBER, Order.deleteById, delete, deny',
    ]);
  });

  it('uses the row domain, defaulting to ANY_MEMBER when null', async () => {
    const { adapter } = makeAdapter({
      catalogRows: [{ subject: 'Order', method: 'find', code: 'Order.find', action: 'read' }],
      metadataColumnName: 'metadata',
    });
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: 'Merchant_9',
        metadata: { ops: ['find'] },
      },
      {
        subjectId: 'r2',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toContain('p, Role_r1, Merchant_9, Order.find, read, allow');
    expect(lines).toContain(
      `p, Role_r2, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.find, read, allow`,
    );
  });

  it('issues no catalog query when there are no custom rows', async () => {
    const { adapter, getExecuteCalls } = makeAdapter();
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order.find',
        objectSubject: 'Order',
        objectMethod: 'find',
        action: 'read',
        effect: null,
        domain: null,
      },
    ];

    await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(getExecuteCalls()).toBe(0);
  });

  it('resolves operations for several custom rows in one catalog query', async () => {
    const { adapter, getExecuteCalls } = makeAdapter({
      catalogRows: [
        { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
        { subject: 'Invoice', method: 'find', code: 'Invoice.find', action: 'read' },
      ],
      metadataColumnName: 'metadata',
    });
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find'] },
      },
      {
        subjectId: 'r1',
        objectCode: 'Invoice',
        objectSubject: 'Invoice',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines.length).toBe(2);
    expect(getExecuteCalls()).toBe(1);
  });

  it('logs and skips an unknown operation name while expanding the rest', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter } = makeAdapter({
      catalogRows: [{ subject: 'Order', method: 'find', code: 'Order.find', action: 'read' }],
      metadataColumnName: 'metadata',
    });
    adapter.logger = logger;
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find', 'explode'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([
      `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.find, read, allow`,
    ]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('explode');
  });

  it('rejects a "*" op as unresolvable instead of resolving it to the resource node, while other ops in the row still expand', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter, captured } = makeAdapter({
      // queryOperationCatalog's guard excludes method = '*', so the DB never hands back a row for the sentinel - only `find` resolves, mirroring production.
      catalogRows: [{ subject: 'Order', method: 'find', code: 'Order.find', action: 'read' }],
      metadataColumnName: 'metadata',
    });
    adapter.logger = logger;
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['*', 'find'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    // '*' does not confer the resource node itself - only the resolved `find` operation is granted.
    expect(lines).toEqual([
      `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.find, read, allow`,
    ]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('*');

    // The guard predicate must actually be present in the emitted catalog query.
    expect(captured[0]).toContain('permission.method <>');
  });

  it('logs and skips the row when action is custom but ops is missing or empty', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter, getExecuteCalls } = makeAdapter({ metadataColumnName: 'metadata' });
    adapter.logger = logger;
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: [] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([]);
    expect(messages.length).toBe(1);
    expect(getExecuteCalls()).toBe(0);
  });

  it('logs and skips the row when ops is present but action is not custom', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter } = makeAdapter({ metadataColumnName: 'metadata' });
    adapter.logger = logger;
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'read',
        effect: null,
        domain: null,
        metadata: { ops: ['find'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('ambiguous');
  });

  it('logs and skips the row when a custom grant targets an operation rather than a resource node', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter } = makeAdapter({ metadataColumnName: 'metadata' });
    adapter.logger = logger;
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order.find',
        objectSubject: 'Order',
        objectMethod: 'find',
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['find'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('resource node');
  });

  it('logs and skips a custom row when metadataColumnName is not mapped', async () => {
    const { logger, messages } = makeCapturingLogger();
    // metadataColumnName omitted: the mapping is not opted into.
    const { adapter, getExecuteCalls } = makeAdapter();
    adapter.logger = logger;
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('metadata.columnName');
    expect(getExecuteCalls()).toBe(0);
  });

  it('leaves legacy per-operation and coarse rows untouched alongside custom rows', async () => {
    const { adapter } = makeAdapter({
      catalogRows: [
        { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
      ],
      metadataColumnName: 'metadata',
    });
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order.find',
        objectSubject: 'Order',
        objectMethod: 'find',
        action: 'read',
        effect: null,
        domain: null,
      },
      {
        subjectId: 'r1',
        objectCode: 'Invoice',
        objectSubject: 'Invoice',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'manage',
        effect: null,
        domain: null,
      },
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['deleteById'] },
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([
      `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.find, read, allow`,
      `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Invoice, manage, allow`,
      `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.deleteById, delete, allow`,
    ]);
  });

  it('leaves legacy rows intact when a custom row sits between them, not just after them', async () => {
    const { adapter } = makeAdapter({
      catalogRows: [
        { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
      ],
      metadataColumnName: 'metadata',
    });
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order.find',
        objectSubject: 'Order',
        objectMethod: 'find',
        action: 'read',
        effect: null,
        domain: null,
      },
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: 'Order',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'custom',
        effect: null,
        domain: null,
        metadata: { ops: ['deleteById'] },
      },
      {
        subjectId: 'r1',
        objectCode: 'Invoice',
        objectSubject: 'Invoice',
        objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
        action: 'manage',
        effect: null,
        domain: null,
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    // Assert membership, not position: expanded lines are appended after the whole row loop, and casbin's `p` table is an unordered set.
    expect(new Set(lines)).toEqual(
      new Set([
        `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.find, read, allow`,
        `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Invoice, manage, allow`,
        `p, Role_r1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order.deleteById, delete, allow`,
      ]),
    );
    expect(lines.length).toBe(3);
  });
});

/** The grant-query stub joins `grantRows` against `catalog` the way the real `permission` join would: a per-operation row's `targetId` is a catalogued code, a custom row's is the resource node, whose subject is inferred from the catalog entries covering its granted ops. */
const adapterFor = (opts: {
  grantRows: Array<{
    subjectId: IdType;
    targetId: unknown;
    action: string;
    effect: string;
    domain?: string | null;
    metadata?: { ops: string[] };
  }>;
  catalog: Array<{ subject: string; method: string; code: string; action: string }>;
}) => {
  const catalogByCode = new Map(opts.catalog.map(entry => [entry.code, entry]));

  const grantQueryRows = opts.grantRows.map(row => {
    const catalogEntry = catalogByCode.get(String(row.targetId));
    if (catalogEntry) {
      return {
        subjectId: row.subjectId,
        objectCode: catalogEntry.code,
        objectSubject: catalogEntry.subject,
        objectMethod: catalogEntry.method,
        action: row.action,
        effect: row.effect,
        domain: row.domain,
        metadata: row.metadata,
      };
    }

    const resourceSubject =
      opts.catalog.find(entry => row.metadata?.ops.includes(entry.method))?.subject ?? '';

    return {
      subjectId: row.subjectId,
      objectCode: resourceSubject,
      objectSubject: resourceSubject,
      objectMethod: AuthorizationPermissionBuilder.RESOURCE_NODE_METHOD,
      action: row.action,
      effect: row.effect,
      domain: row.domain,
      metadata: row.metadata,
    };
  });

  const { adapter } = makeAdapter({ catalogRows: opts.catalog, metadataColumnName: 'metadata' });
  return { adapter, rows: grantQueryRows };
};

describe('ScopedCasbinAdapter - buildGrantLines guard scoping', () => {
  it('logs and skips a grant row whose permission code did not resolve', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter } = makeAdapter();
    adapter.logger = logger;

    // The join can miss when a Permission row is hard-deleted while grants still point at it.
    const rows = [
      {
        subjectId: 'r1',
        objectCode: null,
        objectSubject: null,
        objectMethod: null,
        action: 'read',
        effect: null,
        domain: null,
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('did not resolve');
  });

  it('still reaches the no-action branch when the permission code resolved', async () => {
    const { logger, messages } = makeCapturingLogger();
    const { adapter } = makeAdapter();
    adapter.logger = logger;

    // Proves the resolve guard does not shadow the no-action diagnosis.
    const rows = [
      {
        subjectId: 'r1',
        objectCode: 'Order',
        objectSubject: null,
        objectMethod: null,
        action: null,
        effect: null,
        domain: null,
      },
    ];

    const lines = await adapter['buildGrantLines']({ subjectType: 'Role', rows });

    expect(lines).toEqual([]);
    expect(messages[0]).toContain('no action');
  });
});

describe('planGrant and adapter expansion are mirrors', () => {
  it('a planned ops grant expands to the same lines as equivalent per-operation rows', async () => {
    // find + deleteById covers NEITHER tier fully (read needs four operations, write five), so the planner produces a custom row rather than collapsing into tier grants.
    const catalog = [
      { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
      { subject: 'Order', method: 'findById', code: 'Order.findById', action: 'read' },
      { subject: 'Order', method: 'findOne', code: 'Order.findOne', action: 'read' },
      { subject: 'Order', method: 'count', code: 'Order.count', action: 'read' },
      { subject: 'Order', method: 'create', code: 'Order.create', action: 'create' },
      { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
      { subject: 'Order', method: 'deleteBy', code: 'Order.deleteBy', action: 'delete' },
    ];

    // Path A: plan a custom row, feed it to the adapter, expand.
    const planned = grantBuilder.planGrant({
      subject: { type: 'Role', id: 'r1' },
      resource: { type: 'Permission', id: 'p-order', subject: 'Order' },
      intent: { ops: ['find', 'deleteById'] },
      catalog,
    });

    expect(planned.length).toBe(1);
    const { adapter: customAdapter, rows: customRows } = adapterFor({
      grantRows: planned,
      catalog,
    });
    const customLines = await customAdapter['buildGrantLines']({
      subjectType: 'Role',
      rows: customRows,
    });

    // Path B: the same intent planned WITHOUT custom metadata support - two per-operation rows.
    const legacy = grantBuilder.planGrant({
      subject: { type: 'Role', id: 'r1' },
      resource: { type: 'Permission', id: 'p-order', subject: 'Order' },
      intent: { ops: ['find', 'deleteById'] },
      catalog,
      supportsCustomMetadata: false,
    });

    expect(legacy.length).toBe(2);
    const { adapter: legacyAdapter, rows: legacyRows } = adapterFor({ grantRows: legacy, catalog });
    const legacyLines = await legacyAdapter['buildGrantLines']({
      subjectType: 'Role',
      rows: legacyRows,
    });

    expect(customLines).toEqual(legacyLines);
  });
});
