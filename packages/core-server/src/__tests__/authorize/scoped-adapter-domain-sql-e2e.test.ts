/**
 * Runs `ScopedCasbinAdapter`'s OWN statements against a real Postgres (PGlite). Every other adapter
 * test stubs `execute` and hands back row literals, so none of them execute a single query - a green
 * suite there proves nothing about the SQL.
 *
 * ONE case per query shape, deliberately: the bug this file was written for (a quoted alias failing to
 * resolve against an unquoted FROM alias) is invisible to every check that does not reach a database,
 * and it can recur in any of them.
 */

import { PGlite } from '@electric-sql/pglite';
import { AuthorizationDomainScopes } from '@venizia/ignis-kernel';
import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CustomGrantExpander } from '@/components/auth/authorize/adapters/custom-grant-expander';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
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
  softDelete: { use: false },
});

describe('ScopedCasbinAdapter domain token, built in SQL from the stored pair', () => {
  let db: PGlite;
  let adapter: ScopedCasbinAdapter;
  let connector: { execute: (query: SQL) => Promise<{ rows: unknown[] }> };

  const insertPolicy = async (row: {
    variant: string;
    subjectType: string;
    subjectId: string;
    targetType: string;
    targetId: string;
    action?: string | null;
    effect?: string | null;
    domainType?: string | null;
    domainId?: string | null;
  }) => {
    await db.query(
      `INSERT INTO identity."PolicyDefinition"
         (variant, subject_type, subject_id, target_type, target_id, action, effect, domain_type, domain_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.variant,
        row.subjectType,
        row.subjectId,
        row.targetType,
        row.targetId,
        row.action ?? null,
        row.effect ?? null,
        row.domainType ?? null,
        row.domainId ?? null,
      ],
    );
  };

  /** The `domain` field as the database produced it - the exact output of `domainTokenSelection`. */
  const loadDomains = async (): Promise<Array<string | null>> => {
    const rows = await adapter['queryPrincipalPolicies']({
      principal: { type: 'User', id: 'u1' },
    });

    return rows.map(row => row.domain ?? null);
  };

  beforeAll(async () => {
    db = new PGlite();

    await db.query('CREATE SCHEMA identity');
    await db.query(`
      CREATE TABLE identity."PolicyDefinition" (
        id serial PRIMARY KEY,
        variant text NOT NULL,
        subject_type text NOT NULL,
        subject_id text NOT NULL,
        target_type text NOT NULL,
        target_id text NOT NULL,
        action text,
        effect text,
        domain_type text,
        domain_id text,
        metadata jsonb
      )
    `);
    await db.query(`
      CREATE TABLE identity."Permission" (
        id text PRIMARY KEY,
        code text,
        subject text,
        method text,
        action text
      )
    `);
    for (const permission of [
      ['perm-1', 'Order.find', 'Order', 'find', 'read'],
      ['perm-2', 'Order.node', 'Order', '*', 'manage'],
    ]) {
      await db.query(
        `INSERT INTO identity."Permission" (id, code, subject, method, action) VALUES ($1, $2, $3, $4, $5)`,
        permission,
      );
    }

    connector = {
      execute: async (query: SQL) => {
        const { sql: text, params } = dialect.sqlToQuery(query);
        const result = await db.query(text, params as unknown[]);
        return { rows: result.rows };
      },
    };

    adapter = new ScopedCasbinAdapter({
      dataSource: { connector } as unknown as ICasbinPolicySource,
      entities: entities(),
    });
  });

  afterAll(async () => {
    await db.close();
  });

  test('a typed pair becomes the <Type>_<id> token the matcher compares', async () => {
    await insertPolicy({
      variant: 'grant',
      subjectType: 'User',
      subjectId: 'u1',
      targetType: 'Permission',
      targetId: 'perm-1',
      action: 'read',
      effect: 'allow',
      domainType: 'Merchant',
      domainId: '9',
    });

    expect(await loadDomains()).toEqual(['Merchant_9']);
  });

  test('a null type yields NULL, which downstream reads as ANY_MEMBER', async () => {
    await db.query('TRUNCATE identity."PolicyDefinition"');
    await insertPolicy({
      variant: 'grant',
      subjectType: 'User',
      subjectId: 'u1',
      targetType: 'Permission',
      targetId: 'perm-1',
      action: 'read',
      effect: 'allow',
      domainType: null,
      domainId: null,
    });

    // NULL, not the literal - `buildGrantLines` is what turns it into ANY_MEMBER.
    expect(await loadDomains()).toEqual([null]);
  });

  test('a scope literal passes through without an id appended', async () => {
    await db.query('TRUNCATE identity."PolicyDefinition"');
    await insertPolicy({
      variant: 'grant',
      subjectType: 'User',
      subjectId: 'u1',
      targetType: 'Permission',
      targetId: 'perm-1',
      action: 'read',
      effect: 'allow',
      domainType: AuthorizationDomainScopes.SYSTEM_WIDE,
      domainId: null,
    });

    expect(await loadDomains()).toEqual([AuthorizationDomainScopes.SYSTEM_WIDE]);
  });

  test('an assign_role carries its domain token too', async () => {
    await db.query('TRUNCATE identity."PolicyDefinition"');
    await insertPolicy({
      variant: 'assign_role',
      subjectType: 'User',
      subjectId: 'u1',
      targetType: 'Role',
      targetId: 'r1',
      domainType: 'Organizer',
      domainId: '3',
    });

    expect(await loadDomains()).toEqual(['Organizer_3']);
  });

  /** The other statement the adapter issues - three aliases, two self-joins, and no coverage until now. */
  test('queryEdgePolicies resolves its aliases and emits both structural relations', async () => {
    await db.query('TRUNCATE identity."PolicyDefinition"');

    await insertPolicy({
      variant: 'resource_inherits',
      subjectType: 'Permission',
      subjectId: 'perm-1',
      targetType: 'Permission',
      targetId: 'perm-2',
    });
    await insertPolicy({
      variant: 'action_inherits',
      subjectType: 'Action',
      subjectId: 'read',
      targetType: 'Action',
      targetId: 'manage',
    });

    const lines = await adapter['queryEdgePolicies']();

    expect(lines).toContain('g4, Order.find, Order.node');
    expect(lines).toContain('g5, read, manage');
  });

  /** The third statement, in `CustomGrantExpander`: a row-constructor IN list plus the resource-node filter. */
  test('queryOperationCatalog matches its pairs and excludes the resource node', async () => {
    const expander = new CustomGrantExpander({
      dataSource: { connector } as unknown as ICasbinPolicySource,
      entities: { permission: entities().permission, softDelete: { use: false } },
    });

    const rows = await expander['queryOperationCatalog']({
      pairs: [
        { subject: 'Order', method: 'find' },
        { subject: 'Order', method: '*' },
      ],
    });

    expect(rows).toEqual([
      { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
    ]);
  });
});
