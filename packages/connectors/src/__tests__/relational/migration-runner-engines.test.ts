import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@libsql/client';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { afterEach, describe, expect, test } from 'bun:test';
import type { IRelationalDriver } from '@/relational/core/drivers';
import { RelationalMigrationRunner } from '@/relational/core/migrations';
import type { IMigration } from '@/relational/core/migrations';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';

/**
 * The ledger placement runs against the real engines, not only against a recorder: the schema is created, the table lands
 * in it, and a second boot reads it back and skips what ran. Real PGlite (Postgres) and real libsql in memory (SQLite).
 */

const MIGRATIONS: ReadonlyArray<IMigration> = [
  { name: '0001_notes', sql: 'CREATE TABLE notes (id integer)' },
  { name: '0002_tags', sql: 'CREATE TABLE tags (id integer)' },
];

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
});

const openPglite = () => {
  const client = new PGlite();
  const driver = new PGliteDriver({ client });

  closers.push(async () => {
    await driver.end();
  });

  return { client, driver };
};

const openLibsql = () => {
  const client = createClient({ url: ':memory:' });
  const driver = new LibSqlDriver({ client });

  closers.push(async () => {
    await driver.end();
  });

  return { client, driver };
};

const namesOf = (rows: Array<{ name: string }>) => rows.map((row) => row.name);

describe('the ledger on Postgres (PGlite)', () => {
  test('the default ledger is the table ignis_migrations in the default schema', async () => {
    const { client, driver } = openPglite();

    const runner = new RelationalMigrationRunner({ driver });
    await runner.run({ migrations: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>('SELECT name FROM ignis_migrations');
    expect(namesOf(rows)).toEqual(['0001_notes', '0002_tags']);
  });

  test('a table only: the ledger is that table in the default schema', async () => {
    const { client, driver } = openPglite();

    const runner = new RelationalMigrationRunner({ driver, ledger: { table: 'my_ledger' } });
    await runner.run({ migrations: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>('SELECT name FROM my_ledger');
    expect(namesOf(rows)).toEqual(['0001_notes', '0002_tags']);

    const { rows: others } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables WHERE table_name = 'ignis_migrations'`,
    );
    expect(others[0]!.n).toBe('0');
  });

  test('a schema that does not exist is created, and the ledger table lands in it', async () => {
    const { client, driver } = openPglite();

    const before = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.schemata WHERE schema_name = 'audit'`,
    );
    expect(before.rows[0]!.n).toBe('0');

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'audit' } });
    await runner.run({ migrations: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM audit.ignis_migrations',
    );
    expect(namesOf(rows)).toEqual(['0001_notes', '0002_tags']);
  });

  test('both: a schema and a table of the caller', async () => {
    const { client, driver } = openPglite();

    const runner = new RelationalMigrationRunner({
      driver,
      ledger: { schema: 'audit', table: 'applied' },
    });
    await runner.run({ migrations: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>('SELECT name FROM audit.applied');
    expect(namesOf(rows)).toEqual(['0001_notes', '0002_tags']);
  });

  test('a schema that already exists (public) is accepted, and a second boot skips what ran', async () => {
    const { client, driver } = openPglite();
    const ledger = { schema: 'public', table: 'applied' };

    const first = new RelationalMigrationRunner({ driver, ledger });
    await first.run({ migrations: MIGRATIONS });

    const second = new RelationalMigrationRunner({ driver, ledger });
    await second.run({ migrations: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>('SELECT name FROM public.applied');
    expect(namesOf(rows)).toEqual(['0001_notes', '0002_tags']);
  });

  test('a migration that fails leaves the ledger without its row, and the schema stays', async () => {
    const { client, driver } = openPglite();

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'audit' } });

    await RejectionHelper.expectRejection({
      task: runner.run({
        migrations: [MIGRATIONS[0]!, { name: '0002_bad', sql: 'CREATE TABLE notes (id integer)' }],
      }),
      message: /already exists/,
    });

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM audit.ignis_migrations',
    );
    expect(namesOf(rows)).toEqual(['0001_notes']);
  });
});

describe('the ledger on Postgres for a role that cannot create schemas (PGlite)', () => {
  /** A role with no `CREATE` on the database, which may still use `public`. Not a superuser. */
  const restrictedRole = async (client: PGlite) => {
    await client.exec(`
      CREATE ROLE limited;
      REVOKE CREATE ON DATABASE postgres FROM PUBLIC;
      GRANT ALL ON SCHEMA public TO limited;
      SET ROLE limited;
    `);
  };

  test('the premise: the role cannot run CREATE SCHEMA IF NOT EXISTS even for public', async () => {
    const { client } = openPglite();
    await restrictedRole(client);

    await RejectionHelper.expectRejection({
      task: client.exec('CREATE SCHEMA IF NOT EXISTS public'),
      message: /permission denied for database/,
    });
  });

  test('an existing schema (public) works for that role: the ledger and the migrations land', async () => {
    const { client, driver } = openPglite();
    await restrictedRole(client);

    const runner = new RelationalMigrationRunner({
      driver,
      ledger: { schema: 'public', table: 'applied' },
    });
    await runner.run({ migrations: MIGRATIONS });

    const { rows } = await client.query<{ name: string }>('SELECT name FROM public.applied');
    expect(namesOf(rows)).toEqual(['0001_notes', '0002_tags']);
  });

  test('a missing schema still fails for that role, because it really has to create it', async () => {
    const { client, driver } = openPglite();
    await restrictedRole(client);

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'audit' } });

    await RejectionHelper.expectRejection({
      task: runner.run({ migrations: MIGRATIONS }),
      message: /permission denied for database/,
    });
  });
});

describe('the ledger on SQLite (libsql)', () => {
  test('the default ledger works unqualified', async () => {
    const { client, driver } = openLibsql();

    const runner = new RelationalMigrationRunner({ driver });
    await runner.run({ migrations: MIGRATIONS });

    const result = await client.execute('SELECT name FROM ignis_migrations');
    expect(namesOf(result.rows as unknown as Array<{ name: string }>)).toEqual([
      '0001_notes',
      '0002_tags',
    ]);
  });

  test('the schema main is accepted and holds the ledger', async () => {
    const { client, driver } = openLibsql();

    const runner = new RelationalMigrationRunner({
      driver,
      ledger: { schema: 'main', table: 'applied' },
    });
    await runner.run({ migrations: MIGRATIONS });

    const result = await client.execute('SELECT name FROM main.applied');
    expect(namesOf(result.rows as unknown as Array<{ name: string }>)).toEqual([
      '0001_notes',
      '0002_tags',
    ]);
  });

  test.each(['public', 'audit'])(
    'a schema other than main (%s) is refused at construction by the real driver',
    (schema) => {
      const { driver } = openLibsql();

      expect(() => new RelationalMigrationRunner({ driver, ledger: { schema } })).toThrow(
        /SQLite has only the schema "main"/,
      );
    },
  );
});

describe('the dialect the built-in drivers declare', () => {
  test('PGlite is postgres and libsql is sqlite', () => {
    const pglite: IRelationalDriver<unknown> = openPglite().driver as never;
    const libsql: IRelationalDriver<unknown> = openLibsql().driver as never;

    expect(pglite.dialect).toBe('postgres');
    expect(libsql.dialect).toBe('sqlite');
  });
});
