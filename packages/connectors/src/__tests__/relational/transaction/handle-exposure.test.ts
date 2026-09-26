import type { ITransaction } from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { PGlite } from '@electric-sql/pglite';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { formatLogMessage } from '@venizia/ignis-helpers';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import util from 'node:util';
import {
  POSTGRES_TABLE_DDL,
  POSTGRES_TABLE_NAME,
  SQLITE_TABLE_DDL,
  SQLITE_TABLE_NAME,
  postgresItemTable,
  sqliteItemTable,
} from './engine-fixtures';

/**
 * A transaction handle travels inside options objects, and those get logged, inspected and
 * serialized. It must never carry its datasource or connection along: the datasource holds the
 * connection settings, credentials included. Placeholder credentials act as sentinels - none may
 * ever appear in any rendering of a handle.
 */
const PASSWORD_SENTINEL = 'PLACEHOLDER_SETTINGS_PASSWORD';
const URL_CREDENTIAL_SENTINEL = 'PLACEHOLDER_URL_CREDENTIAL';
const AUTH_TOKEN_SENTINEL = 'PLACEHOLDER_AUTH_TOKEN';
const SENTINELS = [PASSWORD_SENTINEL, URL_CREDENTIAL_SENTINEL, AUTH_TOKEN_SENTINEL];

const findSentinels = (opts: { rendered: string }): string[] =>
  SENTINELS.filter(sentinel => opts.rendered.includes(sentinel));

/**
 * JSON the way safe-stringify loggers and error reporters print it: a repeated object becomes a
 * marker instead of a throw, and a depth cap stops the walk. Plain `JSON.stringify` throws on the
 * drizzle connector's own cycle and so prints nothing; these tools print everything else.
 */
const MAX_PROJECTION_DEPTH = 6;

const projectCycleSafe = (opts: {
  value: unknown;
  depth: number;
  seen: WeakSet<object>;
}): unknown => {
  const { value, depth, seen } = opts;

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return '[Binary]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= MAX_PROJECTION_DEPTH) {
    return '[Depth]';
  }

  seen.add(value);

  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    projected[key] = projectCycleSafe({ value: entry, depth: depth + 1, seen });
  }

  return projected;
};

const stringifyCycleSafe = (opts: { value: unknown }): string =>
  JSON.stringify(projectCycleSafe({ value: opts.value, depth: 0, seen: new WeakSet<object>() }));

interface IExposurePostgresSettings {
  host: string;
  user: string;
  password: string;
  url: string;
}

const postgresSchema = { [POSTGRES_TABLE_NAME]: postgresItemTable };
const sqliteSchema = { [SQLITE_TABLE_NAME]: sqliteItemTable };

class ExposurePostgresDataSource extends BasePostgresDataSource<
  IExposurePostgresSettings,
  typeof postgresSchema,
  {},
  PGlite
> {
  private readonly pglite: PGlite;

  constructor(opts: { client: PGlite }) {
    super({
      name: ExposurePostgresDataSource.name,
      config: {
        host: 'db.example.invalid',
        user: 'app',
        password: PASSWORD_SENTINEL,
        url: `postgres://app:${URL_CREDENTIAL_SENTINEL}@db.example.invalid/app`,
      },
      schema: postgresSchema,
    });

    this.pglite = opts.client;
    this.client = opts.client;
  }

  override configure(): void {
    this.useDriver({ driver: new PGliteDriver<typeof postgresSchema>({ client: this.pglite }) });
  }

  override getConnectionString(): string {
    return this.settings.url;
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

class ExposureSqliteDataSource extends BaseSqliteDataSource<
  { url: string; authToken: string },
  typeof sqliteSchema,
  {},
  Client
> {
  private readonly libsql: Client;

  constructor(opts: { client: Client }) {
    super({
      name: ExposureSqliteDataSource.name,
      config: { url: ':memory:', authToken: AUTH_TOKEN_SENTINEL },
      schema: sqliteSchema,
    });

    this.libsql = opts.client;
    this.client = opts.client;
  }

  override configure(): void {
    this.useDriver({ driver: new LibSqlDriver<typeof sqliteSchema>({ client: this.libsql }) });
  }
}

let pgliteClient: PGlite;
let libsqlClient: Client;
let postgresDataSource: ExposurePostgresDataSource;
let sqliteDataSource: ExposureSqliteDataSource;

beforeAll(async () => {
  pgliteClient = new PGlite();
  await pgliteClient.waitReady;
  await pgliteClient.exec(POSTGRES_TABLE_DDL);

  postgresDataSource = new ExposurePostgresDataSource({ client: pgliteClient });
  postgresDataSource.configure();

  libsqlClient = createClient({ url: ':memory:' });
  await libsqlClient.execute(SQLITE_TABLE_DDL);

  sqliteDataSource = new ExposureSqliteDataSource({ client: libsqlClient });
  sqliteDataSource.configure();
});

afterAll(async () => {
  await postgresDataSource.endDriver();
  libsqlClient.close();
});

/** Everything the old closure-built handle exposed, plus the engine field each datasource adds. */
const ENGINES = [
  {
    engine: 'postgres (PGlite)',
    begin: (): Promise<ITransaction> => postgresDataSource.beginTransaction(),
    dataSource: (): object => postgresDataSource,
    allowedKeys: ['connector', 'isActive', 'commit', 'rollback', 'isolationLevel'],
  },
  {
    engine: 'sqlite (libsql :memory:)',
    begin: (): Promise<ITransaction> => sqliteDataSource.beginTransaction(),
    dataSource: (): object => sqliteDataSource,
    allowedKeys: ['connector', 'isActive', 'commit', 'rollback', 'beginMode'],
  },
];

/** The shape a repository call hands the IGNIS logger when `log.use` is set. */
const buildLoggedPayload = (opts: { transaction: object }) => ({
  data: [{ name: 'logged-row' }],
  options: { transaction: opts.transaction, log: { use: true } },
});

for (const { engine, begin, dataSource, allowedKeys } of ENGINES) {
  describe(`A transaction handle exposes no datasource - ${engine}`, () => {
    /** Each test ends its own transaction: the engine has one session, and a leak starves the next test. */
    const withTransaction = async (opts: {
      run: (runOpts: { transaction: ITransaction }) => void;
    }): Promise<void> => {
      const transaction = await begin();

      try {
        opts.run({ transaction });
      } finally {
        await transaction.rollback();
      }
    };

    test('positive control: the same renderers DO show the sentinels when the datasource itself is logged', () => {
      const rendered = [
        util.inspect(dataSource(), { depth: 4 }),
        formatLogMessage({ message: 'x %s', args: [{ options: { leaked: dataSource() } }] }),
      ].join('\n');

      expect(findSentinels({ rendered }).length).toBeGreaterThan(0);
    });

    test('Object.keys(handle) holds no datasource, connection or internal state', async () => {
      await withTransaction({
        run: ({ transaction }) => {
          const keys = Object.keys(transaction);

          expect(keys).toContain('connector');
          expect(keys.filter(key => !allowedKeys.includes(key))).toEqual([]);
        },
      });
    });

    test('JSON.stringify(handle), cycle-safe as loggers do it, carries no settings or credential', async () => {
      await withTransaction({
        run: ({ transaction }) => {
          const rendered = stringifyCycleSafe({ value: transaction });

          expect(findSentinels({ rendered })).toEqual([]);
          expect(rendered).not.toContain('"settings"');
          expect(rendered).not.toContain('"dataSource"');
        },
      });
    });

    test('util.inspect(handle) carries no settings or credential, at any depth', async () => {
      await withTransaction({
        run: ({ transaction }) => {
          const rendered = [
            util.inspect(transaction),
            util.inspect(transaction, { depth: 4 }),
            util.inspect(transaction, { depth: null }),
          ].join('\n');

          expect(findSentinels({ rendered })).toEqual([]);
        },
      });
    });

    test("the IGNIS logger's %j rendering of { transaction } carries no settings or credential", async () => {
      await withTransaction({
        run: ({ transaction }) => {
          const rendered = [
            formatLogMessage({
              message: 'Executing with opts: %j',
              args: [buildLoggedPayload({ transaction })],
            }),
            formatLogMessage({ message: '%j', args: [{ transaction }] }),
          ].join('\n');

          expect(findSentinels({ rendered })).toEqual([]);
          expect(rendered).not.toContain('settings');
        },
      });
    });

    test("the IGNIS logger's %s rendering of { transaction } carries no settings or credential", async () => {
      await withTransaction({
        run: ({ transaction }) => {
          const rendered = [
            formatLogMessage({
              message: 'Executing with opts: %s',
              args: [buildLoggedPayload({ transaction })],
            }),
            formatLogMessage({ message: '%s', args: [{ transaction }] }),
          ].join('\n');

          expect(findSentinels({ rendered })).toEqual([]);
          expect(rendered).not.toContain('settings');
        },
      });
    });

    test('a spread copy of the handle carries no datasource, settings or credential', async () => {
      await withTransaction({
        run: ({ transaction }) => {
          const copy = { ...transaction };
          const rendered = [
            stringifyCycleSafe({ value: copy }),
            util.inspect(copy, { depth: null }),
            formatLogMessage({ message: '%j %s', args: [copy, copy] }),
          ].join('\n');

          expect(Object.keys(copy).filter(key => !allowedKeys.includes(key))).toEqual([]);
          expect(findSentinels({ rendered })).toEqual([]);
        },
      });
    });
  });
}
