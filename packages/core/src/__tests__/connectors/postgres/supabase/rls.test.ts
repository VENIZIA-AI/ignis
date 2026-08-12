import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { withAuthContext } from '@/connectors/postgres/supabase';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

/** Renders a captured statement exactly as the driver would send it, params separated from text. */
const compile = (statement: SQL) => dialect.sqlToQuery(statement);

const buildTransaction = () => {
  const executed: SQL[] = [];

  return {
    executed,
    transaction: {
      isActive: true,
      isolationLevel: 'READ COMMITTED',
      connector: {
        execute: async (statement: SQL) => {
          executed.push(statement);
          return undefined;
        },
      },
      commit: async () => undefined,
      rollback: async () => undefined,
    } as AnyType,
  };
};

describe('withAuthContext', () => {
  test('issues set_config then set local role, inside the caller transaction', async () => {
    const { transaction, executed } = buildTransaction();

    await withAuthContext({ transaction, claims: { sub: 'user-1' }, role: 'authenticated' });

    expect(executed).toHaveLength(2);
    expect(compile(executed[0]).sql).toContain('set_config');
    expect(compile(executed[1]).sql).toBe('set local role authenticated');
  });

  test('claims are BOUND as a parameter, never interpolated into the SQL text', async () => {
    const { transaction, executed } = buildTransaction();
    const claims = { sub: "u'1", role: 'authenticated' };

    await withAuthContext({ transaction, claims, role: 'authenticated' });

    const { sql: text, params } = compile(executed[0]);

    // If claims were interpolated, a quote in `sub` would terminate the string literal.
    expect(text).not.toContain("u'1");
    expect(params).toEqual([JSON.stringify(claims)]);
  });

  test('the config is transaction-scoped (set_config is_local = true)', async () => {
    const { transaction, executed } = buildTransaction();

    await withAuthContext({ transaction, claims: {}, role: 'authenticated' });

    // Plain `SET` would leak the identity to the next borrower of a pooled connection.
    expect(compile(executed[0]).sql).toContain('true');
  });

  for (const role of [
    'authenticated; drop table users; --',
    'authenticated"',
    'auth enticated',
    '1role',
    'Authenticated',
    '',
  ]) {
    test(`rejects the role ${JSON.stringify(role)} before any statement runs`, async () => {
      const { transaction, executed } = buildTransaction();

      // `set local role $1` is not valid SQL, so the role must be interpolated - an unvalidated role taken from a JWT would be a direct privilege-escalation vector.
      let caught: unknown;
      try {
        await withAuthContext({ transaction, claims: {}, role });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect((caught as Error).message).toMatch(/invalid role/i);
      // The guard must run BEFORE set_config, or a rejected call still mutated the session.
      expect(executed).toHaveLength(0);
    });
  }

  test('role defaults to the claims role - PostgREST semantics', async () => {
    const { transaction, executed } = buildTransaction();

    await withAuthContext({ transaction, claims: { sub: 'user-1', role: 'service_role' } });

    expect(compile(executed[1]).sql).toBe('set local role service_role');
  });

  test('an explicit role overrides the claims role', async () => {
    const { transaction, executed } = buildTransaction();

    await withAuthContext({
      transaction,
      claims: { role: 'authenticated' },
      role: 'supabase_auth_admin',
    });

    expect(compile(executed[1]).sql).toBe('set local role supabase_auth_admin');
  });

  test('no role argument and no usable role claim throws before any statement runs', async () => {
    for (const claims of [{}, { role: 42 }, { role: null }] as const) {
      const { transaction, executed } = buildTransaction();

      let caught: unknown;
      try {
        await withAuthContext({ transaction, claims: claims as Record<string, unknown> });
      } catch (error) {
        caught = error;
      }

      expect((caught as Error).message).toMatch(/invalid role/i);
      expect(executed).toHaveLength(0);
    }
  });

  test('a malicious claims role is rejected exactly like a malicious explicit role', async () => {
    const { transaction, executed } = buildTransaction();

    let caught: unknown;
    try {
      await withAuthContext({ transaction, claims: { role: 'anon; drop table users; --' } });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toMatch(/invalid role/i);
    expect(executed).toHaveLength(0);
  });

  test('nested and unicode claims round-trip intact through the bound parameter', async () => {
    const { transaction, executed } = buildTransaction();
    const claims = {
      role: 'authenticated',
      user: { id: 1, roles: ['a', 'b'] },
      name: 'Nguyễn Văn A',
    };

    await withAuthContext({ transaction, claims });

    const { params } = compile(executed[0]);
    expect(JSON.parse(params[0] as string)).toEqual(claims);
  });

  test('accepts the Supabase roles it exists to serve', async () => {
    for (const role of ['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) {
      const { transaction } = buildTransaction();

      await withAuthContext({ transaction, claims: {}, role });
    }
  });
});
