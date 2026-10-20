import { describe, expect, it, test } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { ICasbinPolicySource } from '@/components/auth/authorize/adapters/common';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin';
import type { IScopedCasbinEntities } from '@/components/auth/authorize/adapters/common';
import { AuthorizationDomainScopes } from '@venizia/ignis-kernel';
import type { ILogger } from '@venizia/ignis-helpers/core';

const dialect = new PgDialect();

const entities = (): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

// Stub connector - branches on PARAMS, since Drizzle parameterizes interpolated VALUES and the variant lives in params.
// rowsFor may return a promise so tests can delay resolution and force a query to stay in flight.
function makeAdapter(
  rowsFor: (sqlText: string, params: unknown[]) => unknown[] | Promise<unknown[]> = () => [],
) {
  const captured: string[] = [];
  let executeCalls = 0;
  const connector = {
    execute: async (query: SQL) => {
      executeCalls += 1;
      const { sql: text, params } = dialect.sqlToQuery(query);
      captured.push(text);
      const rows = await rowsFor(text, params);
      return { rows };
    },
  };
  // The adapter only ever calls `.execute`, so the stub implements only that out of drizzle's full generated node-postgres type.
  const dataSource = { connector } as ICasbinPolicySource;
  const adapter = new ScopedCasbinAdapter({ dataSource, entities: entities() });
  return { adapter, captured, getExecuteCalls: () => executeCalls };
}

describe('scoped-adapter-edges — buildGrantLines', () => {
  test('null action → row dropped (no malformed line emitted)', async () => {
    const { adapter } = makeAdapter();
    const lines = await adapter['buildGrantLines']({
      subjectType: 'User',
      rows: [
        {
          subjectId: 'u1',
          objectCode: 'Order',
          objectSubject: null,
          objectMethod: null,
          action: null,
          effect: null,
          domain: null,
        },
        {
          subjectId: 'u1',
          objectCode: 'Order',
          objectSubject: null,
          objectMethod: null,
          action: 'read',
          effect: null,
          domain: null,
        },
      ],
    });
    expect(lines).toEqual([
      `p, User_u1, ${AuthorizationDomainScopes.ANY_MEMBER}, Order, read, allow`,
    ]);
  });

  test('null effect → allow; null domain → ANY_MEMBER; explicit values preserved', async () => {
    const { adapter } = makeAdapter();
    const lines = await adapter['buildGrantLines']({
      subjectType: 'User',
      rows: [
        {
          subjectId: 'u1',
          objectCode: 'A',
          objectSubject: null,
          objectMethod: null,
          action: 'read',
          effect: null,
          domain: null,
        },
        {
          subjectId: 'u1',
          objectCode: 'B',
          objectSubject: null,
          objectMethod: null,
          action: 'write',
          effect: 'deny',
          domain: 'Merchant_7',
        },
      ],
    });
    expect(lines).toContain(`p, User_u1, ${AuthorizationDomainScopes.ANY_MEMBER}, A, read, allow`);
    expect(lines).toContain('p, User_u1, Merchant_7, B, write, deny');
  });

  it('logs and skips a grant row with no action rather than dropping it silently', async () => {
    const messages: string[] = [];
    const { adapter } = makeAdapter();
    const noop = (): void => {};
    // Fully implements ILogger (rather than a `.for()`-only partial) so no cast is needed to assign it.
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
    adapter.logger = errorLogger;

    const lines = await adapter['buildGrantLines']({
      subjectType: 'User',
      rows: [
        {
          subjectId: 'u1',
          objectCode: 'Order',
          objectSubject: null,
          objectMethod: null,
          action: null,
          effect: null,
          domain: null,
        },
      ],
    });

    expect(lines).toEqual([]);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('no action');
  });
});

// g4 resource and g5 action are one merged statement and each row already carries the rel/child/parent shape its SELECT produces, so a single-row stub isolates one branch.
// g3 domain edges moved to queryPrincipalPolicies - domain_closure coverage lives in scoped-adapter-single-wave.test.ts.
describe('scoped-adapter-edges — line emission shapes', () => {
  test('resource_inherits → g4 line (child, parent codes)', async () => {
    const { adapter } = makeAdapter(() => [{ rel: 'g4', child: 'OrderItem', parent: 'Order' }]);
    const lines = await adapter['queryEdgePolicies']();
    expect(lines).toEqual(['g4, OrderItem, Order']);
  });

  test('action_inherits → g5 line', async () => {
    const { adapter } = makeAdapter(() => [{ rel: 'g5', child: 'read', parent: 'manage' }]);
    const lines = await adapter['queryEdgePolicies']();
    expect(lines).toEqual(['g5, read, manage']);
  });

  test('queryEdgePolicies no longer references domain_inherits', async () => {
    const { adapter, captured } = makeAdapter();
    await adapter['queryEdgePolicies']();
    expect(captured[0]).not.toContain('domain_inherits');
  });
});
