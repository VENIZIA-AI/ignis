/**
 * Runs `ScopedCasbinAdapter`'s OWN statements against a real Postgres (PGlite). Every other adapter
 * test stubs `execute` and hands back row literals, so none of them exercise the SQL that builds the
 * domain token from `(domain_type, domain_id)` - a green suite there proves nothing about this.
 */

import { PGlite } from '@electric-sql/pglite';
import { AuthorizationDomainScopes } from '@venizia/ignis-kernel';
import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
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
        method text
      )
    `);
    await db.query(
      `INSERT INTO identity."Permission" (id, code, subject, method) VALUES ($1, $2, $3, $4)`,
      ['perm-1', 'Order.find', 'Order', 'find'],
    );

    const connector = {
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
});
