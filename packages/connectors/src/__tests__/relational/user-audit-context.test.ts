import { afterEach, describe, expect, test } from 'bun:test';
import { pgTable } from 'drizzle-orm/pg-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { Authentication, RequestContextRegistry } from '@venizia/ignis-kernel';
import { generateUserAuditColumnDefs as generatePostgresUserAuditColumnDefs } from '@/relational/postgres/models';
import { generateUserAuditColumnDefs as generateSqliteUserAuditColumnDefs } from '@/relational/sqlite/models';

/**
 * A `Context` stand-in with only what the enricher touches. `userId: undefined` is the SECOND state -
 * a live request whose context carries no authenticated user - and it must stay distinguishable from
 * having no context at all.
 */
const buildContext = (opts: { userId?: number }): AnyType => {
  return {
    get: (key: string) => (key === Authentication.AUDIT_USER_ID ? opts.userId : undefined),
  } as AnyType;
};

const NO_CONTEXT_MESSAGE = /Invalid request context to identify user/;
const NO_USER_MESSAGE = /No AUDIT_USER_ID found in request context/;

const buildColumnOpts = (opts: { allowAnonymous: boolean }) => {
  return {
    created: {
      dataType: 'number' as const,
      columnName: 'created_by',
      allowAnonymous: opts.allowAnonymous,
    },
    modified: {
      dataType: 'number' as const,
      columnName: 'modified_by',
      allowAnonymous: opts.allowAnonymous,
    },
  };
};

const postgresAnonymousTable = pgTable('pg_user_audit_anonymous', {
  ...generatePostgresUserAuditColumnDefs(buildColumnOpts({ allowAnonymous: true })),
});

const postgresStrictTable = pgTable('pg_user_audit_strict', {
  ...generatePostgresUserAuditColumnDefs(buildColumnOpts({ allowAnonymous: false })),
});

const sqliteAnonymousTable = sqliteTable('sqlite_user_audit_anonymous', {
  ...generateSqliteUserAuditColumnDefs(buildColumnOpts({ allowAnonymous: true })),
});

const sqliteStrictTable = sqliteTable('sqlite_user_audit_strict', {
  ...generateSqliteUserAuditColumnDefs(buildColumnOpts({ allowAnonymous: false })),
});

/** `$default` and `$onUpdate` are what drizzle calls per row; reading them back is the only way to exercise the enricher without a live engine. */
const stampCreatedBy = (opts: { table: AnyType }): unknown => opts.table.createdBy.defaultFn();
const stampModifiedBy = (opts: { table: AnyType }): unknown => opts.table.modifiedBy.onUpdateFn();

const TIERS: Array<{ name: string; anonymous: AnyType; strict: AnyType }> = [
  { name: 'postgres', anonymous: postgresAnonymousTable, strict: postgresStrictTable },
  { name: 'sqlite', anonymous: sqliteAnonymousTable, strict: sqliteStrictTable },
];

/**
 * The enricher reads the request context through `RequestContextRegistry` rather than
 * `hono/context-storage`, and the seam has to keep THREE states apart - each carries its own error
 * and its own `allowAnonymous` behaviour, and this is what decides the `createdBy`/`modifiedBy` a row
 * is stamped with:
 *
 * 1. no request context at all - a browser Worker, a migration script, a background job;
 * 2. a request context that carries no authenticated user;
 * 3. a request context that carries one.
 *
 * A resolver that could not tell (1) from (2) would collapse two different errors into one.
 */
describe.each(TIERS)('the $name user-audit enricher - request context states', tier => {
  afterEach(() => {
    RequestContextRegistry.clearResolver();
  });

  test('state 1 - no resolver installed reads as "no request context"', () => {
    RequestContextRegistry.clearResolver();

    expect(stampCreatedBy({ table: tier.anonymous })).toBeNull();
    expect(stampModifiedBy({ table: tier.anonymous })).toBeNull();

    expect(() => stampCreatedBy({ table: tier.strict })).toThrow(NO_CONTEXT_MESSAGE);
    expect(() => stampModifiedBy({ table: tier.strict })).toThrow(NO_CONTEXT_MESSAGE);
  });

  test('state 1 - a resolver that finds no context reads the same way', () => {
    RequestContextRegistry.setResolver({ resolver: () => undefined });

    expect(stampCreatedBy({ table: tier.anonymous })).toBeNull();
    expect(() => stampCreatedBy({ table: tier.strict })).toThrow(NO_CONTEXT_MESSAGE);
  });

  test('state 2 - a context with no user is its own state, with its own error', () => {
    RequestContextRegistry.setResolver({ resolver: () => buildContext({}) });

    expect(stampCreatedBy({ table: tier.anonymous })).toBeNull();
    expect(stampModifiedBy({ table: tier.anonymous })).toBeNull();

    expect(() => stampCreatedBy({ table: tier.strict })).toThrow(NO_USER_MESSAGE);
    expect(() => stampCreatedBy({ table: tier.strict })).not.toThrow(NO_CONTEXT_MESSAGE);
  });

  test('state 3 - a context with a user stamps that user, whatever allowAnonymous says', () => {
    RequestContextRegistry.setResolver({ resolver: () => buildContext({ userId: 42 }) });

    expect(stampCreatedBy({ table: tier.anonymous })).toBe(42);
    expect(stampModifiedBy({ table: tier.anonymous })).toBe(42);
    expect(stampCreatedBy({ table: tier.strict })).toBe(42);
    expect(stampModifiedBy({ table: tier.strict })).toBe(42);
  });
});
