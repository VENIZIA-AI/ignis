import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';
import { RelationalMigrationRunner } from '@/relational/core/migrations';
import type { IMigration } from '@/relational/core/migrations';
import type { IRelationalDriver, TRelationalDialect } from '@/relational/core/drivers';

/**
 * Records every statement in order, so the tests assert the SEQUENCE - which is the whole point of
 * this class. `failOn` makes one statement throw, which is how the crash window is driven.
 */
const buildFakeDriver = (opts?: {
  applied?: Array<string>;
  failOn?: RegExp;
  dialect?: TRelationalDialect;
  /** Schemas that already exist: the answer to the lookup of `pg_namespace`. */
  schemas?: Array<string>;
}) => {
  const statements: Array<string> = [];
  const ledger = new Set(opts?.applied ?? []);
  let releaseCount = 0;

  const driver: IRelationalDriver<unknown> = {
    dialect: opts?.dialect,
    createConnector: () => ({}),
    getClient: () => ({}),
    end: async () => undefined,
    acquire: async () => ({
      connector: {},
      execute: async (executeOpts: { statement: string }) => {
        statements.push(executeOpts.statement);

        if (opts?.failOn?.test(executeOpts.statement)) {
          throw new Error(`boom: ${executeOpts.statement}`);
        }

        return { count: 0 };
      },
      query: async <R>(queryOpts: { statement: string }) => {
        statements.push(queryOpts.statement);

        if (queryOpts.statement.includes('pg_namespace')) {
          const found = (opts?.schemas ?? []).filter((schema) =>
            queryOpts.statement.endsWith(`'${schema}'`),
          );

          return found.map((name) => ({ name })) as Array<R>;
        }

        return [...ledger].map((name) => ({ name })) as Array<R>;
      },
      release: () => {
        releaseCount += 1;
      },
    }),
  };

  return { driver, statements, releaseCount: () => releaseCount };
};

const MIGRATIONS: ReadonlyArray<IMigration> = [
  { name: '0001_notes', sql: 'CREATE TABLE notes (id integer)' },
  { name: '0002_index', sql: 'CREATE INDEX notes_id ON notes (id)' },
];

describe('RelationalMigrationRunner', () => {
  test('creates the ledger, reads it, then applies each pending migration in a transaction', async () => {
    const { driver, statements, releaseCount } = buildFakeDriver();

    const relationalMigrationRunner = new RelationalMigrationRunner({ driver });
    await relationalMigrationRunner.run({ migrations: MIGRATIONS });

    // The ledger table is created in its own small transaction, then read.
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toContain('CREATE TABLE IF NOT EXISTS "ignis_migrations"');
    expect(statements[2]).toBe('COMMIT');
    expect(statements[3]).toContain('SELECT "name" FROM "ignis_migrations"');

    // The DDL and its ledger row are INSIDE one BEGIN/COMMIT - the property the whole class exists
    // for. Two separate commits leave a created table with no ledger row on a crash between them.
    expect(statements.slice(4)).toEqual([
      'BEGIN',
      'CREATE TABLE notes (id integer)',
      `INSERT INTO "ignis_migrations" ("name") VALUES ('0001_notes')`,
      'COMMIT',
      'BEGIN',
      'CREATE INDEX notes_id ON notes (id)',
      `INSERT INTO "ignis_migrations" ("name") VALUES ('0002_index')`,
      'COMMIT',
    ]);

    expect(releaseCount()).toBe(1);
  });

  test('a migration already in the ledger is skipped entirely', async () => {
    const { driver, statements } = buildFakeDriver({ applied: ['0001_notes'] });

    const relationalMigrationRunner = new RelationalMigrationRunner({ driver });
    await relationalMigrationRunner.run({ migrations: MIGRATIONS });

    expect(statements).not.toContain('CREATE TABLE notes (id integer)');
    expect(statements).toContain('CREATE INDEX notes_id ON notes (id)');
  });

  test('a failing migration rolls back, rethrows, and still releases the connection', async () => {
    const { driver, statements, releaseCount } = buildFakeDriver({ failOn: /CREATE TABLE notes/ });

    let failure: unknown;

    try {
      const relationalMigrationRunner = new RelationalMigrationRunner({ driver });
      await relationalMigrationRunner.run({ migrations: MIGRATIONS });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(String(failure)).toContain('boom');
    expect(statements).toContain('ROLLBACK');
    // The only COMMIT is the ledger table's own: the failed migration never committed.
    expect(statements.filter((statement) => statement === 'COMMIT')).toHaveLength(1);

    // The second migration must NOT run after the first failed - and the connection is not leaked.
    expect(statements).not.toContain('CREATE INDEX notes_id ON notes (id)');
    expect(releaseCount()).toBe(1);
  });

  test('a name outside the safe character set is REFUSED, never escaped', async () => {
    const { driver, statements } = buildFakeDriver();

    let failure: unknown;

    try {
      const relationalMigrationRunner = new RelationalMigrationRunner({ driver });
      await relationalMigrationRunner.run({
        migrations: [{ name: `x'); DROP TABLE notes; --`, sql: 'SELECT 1' }],
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(String(failure)).toContain('Unsafe migration name');

    // Refused BEFORE anything ran: names are validated up front, so a bad one in the middle of a
    // list cannot half-apply the list ahead of it.
    expect(statements).toEqual([]);
  });

  test("a drizzle-kit file's statements each run on their own call", async () => {
    const { driver, statements } = buildFakeDriver();

    const relationalMigrationRunner = new RelationalMigrationRunner({ driver });
    await relationalMigrationRunner.run({
      migrations: [
        {
          name: '0003_multi',
          sql: 'CREATE TABLE a (id integer);\n--> statement-breakpoint\nCREATE TABLE b (id integer);',
        },
      ],
    });

    // Not one blob: PGlite's `query` and postgres-js both reject a multi-statement string, so the
    // runner must honour drizzle-kit's own breakpoints rather than hand the file over whole.
    expect(statements).toContain('CREATE TABLE a (id integer);');
    expect(statements).toContain('CREATE TABLE b (id integer);');
    // One BEGIN for the ledger table, one for the migration: the migration's statements share theirs.
    expect(statements.filter((statement) => statement === 'BEGIN')).toHaveLength(2);
  });
});

describe("RelationalMigrationRunner's ledger", () => {
  const ledgerStatements = (statements: Array<string>) =>
    statements.filter((statement) => /ledger_t|ignis_migrations|SCHEMA/.test(statement));

  const placements: Array<[string, { schema?: string; table?: string } | undefined, string]> = [
    ['omitted', undefined, '"ignis_migrations"'],
    ['empty', {}, '"ignis_migrations"'],
    ['a table only', { table: 'my_ledger' }, '"my_ledger"'],
    ['a schema only', { schema: 'audit' }, '"audit"."ignis_migrations"'],
    ['both', { schema: 'audit', table: 'my_ledger' }, '"audit"."my_ledger"'],
  ];

  test.each(placements)('%s: the ledger is written as %s', async (_name, ledger, expected) => {
    const { driver, statements } = buildFakeDriver({ dialect: 'postgres' });

    const runner = new RelationalMigrationRunner({ driver, ledger });
    await runner.run({ migrations: [MIGRATIONS[0]!] });

    expect(statements.filter((statement) => statement.includes(expected))).toHaveLength(3);

    // Only a schema named by the caller is qualified; the default stays the engine's own.
    if (ledger?.table === undefined && ledger?.schema === undefined) {
      expect(statements.some((statement) => statement.includes('"ignis_migrations"."'))).toBe(
        false,
      );
    }
  });

  test('a missing Postgres schema is created in the same transaction as the ledger table, before it', async () => {
    const { driver, statements } = buildFakeDriver({ dialect: 'postgres' });

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'audit' } });
    await runner.run({ migrations: [] });

    expect(statements.slice(0, 5)).toEqual([
      'BEGIN',
      `SELECT nspname AS name FROM pg_namespace WHERE nspname = 'audit'`,
      'CREATE SCHEMA "audit"',
      'CREATE TABLE IF NOT EXISTS "audit"."ignis_migrations" ("name" text PRIMARY KEY NOT NULL)',
      'COMMIT',
    ]);
  });

  test('a schema that exists is looked up and never created', async () => {
    const { driver, statements } = buildFakeDriver({ dialect: 'postgres', schemas: ['public'] });

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'public' } });
    await runner.run({ migrations: [] });

    expect(statements.some((statement) => statement.includes('pg_namespace'))).toBe(true);
    expect(statements.some((statement) => statement.includes('CREATE SCHEMA'))).toBe(false);
  });

  test('no schema named: no CREATE SCHEMA is run', async () => {
    const { driver, statements } = buildFakeDriver({ dialect: 'postgres' });

    const runner = new RelationalMigrationRunner({ driver, ledger: { table: 'my_ledger' } });
    await runner.run({ migrations: [] });

    expect(statements.some((statement) => statement.includes('SCHEMA'))).toBe(false);
  });

  test('a failing ledger bootstrap rolls back and the first migration never runs', async () => {
    const { driver, statements } = buildFakeDriver({
      dialect: 'postgres',
      failOn: /CREATE SCHEMA/,
    });

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'audit' } });

    await RejectionHelper.expectRejection({
      task: runner.run({ migrations: MIGRATIONS }),
      message: /boom/,
    });
    expect(statements).toEqual([
      'BEGIN',
      `SELECT nspname AS name FROM pg_namespace WHERE nspname = 'audit'`,
      'CREATE SCHEMA "audit"',
      'ROLLBACK',
    ]);
  });

  test("SQLite's own schema `main` is accepted, written qualified, and creates no schema", async () => {
    const { driver, statements } = buildFakeDriver({ dialect: 'sqlite' });

    const runner = new RelationalMigrationRunner({ driver, ledger: { schema: 'main' } });
    await runner.run({ migrations: [] });

    expect(statements[1]).toBe(
      'CREATE TABLE IF NOT EXISTS "main"."ignis_migrations" ("name" text PRIMARY KEY NOT NULL)',
    );
    expect(statements.some((statement) => statement.includes('CREATE SCHEMA'))).toBe(false);
  });

  test.each(['public', 'audit', 'temp', 'Main'])(
    'SQLite refuses the schema %s at construction, never ignores it',
    (schema) => {
      const { driver } = buildFakeDriver({ dialect: 'sqlite' });

      expect(() => new RelationalMigrationRunner({ driver, ledger: { schema } })).toThrow(
        /SQLite has only the schema "main"/,
      );
    },
  );

  test('a driver that declares no dialect accepts no schema, and still takes a table', () => {
    const { driver } = buildFakeDriver();

    expect(() => new RelationalMigrationRunner({ driver, ledger: { schema: 'audit' } })).toThrow(
      /declares no dialect/,
    );
    expect(() => new RelationalMigrationRunner({ driver, ledger: { table: 't' } })).not.toThrow();
  });

  test.each([
    ['table', { table: 'a"; DROP TABLE b; --' }, /Unsafe ledger\.table/],
    ['schema', { schema: 'a"; DROP SCHEMA b; --' }, /Unsafe ledger\.schema/],
    ['an empty table', { table: '' }, /Unsafe ledger\.table/],
    ['a non-string schema', { schema: 5 as never }, /Unsafe ledger\.schema/],
  ])('an unsafe name is refused at construction: %s', (_name, ledger, message) => {
    const { driver } = buildFakeDriver({ dialect: 'postgres' });

    expect(() => new RelationalMigrationRunner({ driver, ledger })).toThrow(message);
  });

  test.each([
    ['a string', 'my_ledger'],
    ['null', null],
    ['an array', []],
  ])('a ledger that is not an object is refused: %s', (_name, ledger) => {
    const { driver } = buildFakeDriver({ dialect: 'postgres' });

    expect(() => new RelationalMigrationRunner({ driver, ledger: ledger as never })).toThrow(
      /ledger must be an object/,
    );
  });

  test.each([
    ['a name', 'my_ledger'],
    ['undefined', undefined],
  ])('the removed ledgerTable is refused with a pointer to ledger: %s', (_name, ledgerTable) => {
    const { driver } = buildFakeDriver({ dialect: 'postgres' });

    expect(() => new RelationalMigrationRunner({ driver, ledgerTable } as never)).toThrow(
      /`ledgerTable` is removed \| use `ledger: \{ table \}`/,
    );
  });

  test('only the ledger statements carry the ledger name', async () => {
    const { driver, statements } = buildFakeDriver({ dialect: 'postgres' });

    const runner = new RelationalMigrationRunner({
      driver,
      ledger: { schema: 'audit', table: 'ledger_t' },
    });
    await runner.run({ migrations: [MIGRATIONS[0]!] });

    expect(ledgerStatements(statements).every((statement) => statement.includes('"audit"'))).toBe(
      true,
    );
    expect(statements).toContain('CREATE TABLE notes (id integer)');
  });
});
