import { describe, expect, test } from 'bun:test';
import { RelationalMigrationRunner } from '@/relational/core/migrations';
import type { IMigration } from '@/relational/core/migrations';
import type { IRelationalDriver } from '@/relational/core/drivers';

/**
 * Records every statement in order, so the tests assert the SEQUENCE - which is the whole point of
 * this class. `failOn` makes one statement throw, which is how the crash window is driven.
 */
const buildFakeDriver = (opts?: { applied?: Array<string>; failOn?: RegExp }) => {
  const statements: Array<string> = [];
  const ledger = new Set(opts?.applied ?? []);
  let releaseCount = 0;

  const driver: IRelationalDriver<unknown> = {
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
        return [...ledger].map(name => ({ name })) as Array<R>;
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

    await new RelationalMigrationRunner({ driver }).run({ migrations: MIGRATIONS });

    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS "ignis_migrations"');
    expect(statements[1]).toContain('SELECT "name" FROM "ignis_migrations"');

    // The DDL and its ledger row are INSIDE one BEGIN/COMMIT - the property the whole class exists
    // for. Two separate commits leave a created table with no ledger row on a crash between them.
    expect(statements.slice(2)).toEqual([
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

    await new RelationalMigrationRunner({ driver }).run({ migrations: MIGRATIONS });

    expect(statements).not.toContain('CREATE TABLE notes (id integer)');
    expect(statements).toContain('CREATE INDEX notes_id ON notes (id)');
  });

  test('a failing migration rolls back, rethrows, and still releases the connection', async () => {
    const { driver, statements, releaseCount } = buildFakeDriver({ failOn: /CREATE TABLE notes/ });

    const failure = await new RelationalMigrationRunner({ driver })
      .run({ migrations: MIGRATIONS })
      .catch((error: unknown) => error);

    expect(String(failure)).toContain('boom');
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');

    // The second migration must NOT run after the first failed - and the connection is not leaked.
    expect(statements).not.toContain('CREATE INDEX notes_id ON notes (id)');
    expect(releaseCount()).toBe(1);
  });

  test('a name outside the safe character set is REFUSED, never escaped', async () => {
    const { driver, statements } = buildFakeDriver();

    const failure = await new RelationalMigrationRunner({ driver })
      .run({ migrations: [{ name: `x'); DROP TABLE notes; --`, sql: 'SELECT 1' }] })
      .catch((error: unknown) => error);

    expect(String(failure)).toContain('Unsafe migration name');

    // Refused BEFORE anything ran: names are validated up front, so a bad one in the middle of a
    // list cannot half-apply the list ahead of it.
    expect(statements).toEqual([]);
  });

  test('an unsafe ledger table name is refused at construction', () => {
    const { driver } = buildFakeDriver();

    expect(
      () => new RelationalMigrationRunner({ driver, ledgerTable: 'a"; DROP TABLE b; --' }),
    ).toThrow(/Unsafe ledgerTable/);
  });

  test("a drizzle-kit file's statements each run on their own call", async () => {
    const { driver, statements } = buildFakeDriver();

    await new RelationalMigrationRunner({ driver }).run({
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
    expect(statements.filter(statement => statement === 'BEGIN')).toHaveLength(1);
  });

  test('the ledger table is configurable', async () => {
    const { driver, statements } = buildFakeDriver();

    await new RelationalMigrationRunner({ driver, ledgerTable: 'my_ledger' }).run({
      migrations: [MIGRATIONS[0]!],
    });

    expect(statements[0]).toContain('"my_ledger"');
    expect(statements.some(statement => statement.includes('"ignis_migrations"'))).toBe(false);
  });
});
