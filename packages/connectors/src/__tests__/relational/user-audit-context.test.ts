import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  Authentication,
  BaseAppErrorMiddleware,
  ControllerFactory,
  datasource,
  model,
  RequestContextRegistry,
} from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import {
  BasePostgresEntity,
  generateTzColumnDefs as generatePostgresTzColumnDefs,
  generateUserAuditColumnDefs as generatePostgresUserAuditColumnDefs,
} from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { TTableInsert, TTableObject } from '@/relational/core/models';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import {
  BaseSqliteEntity,
  generateTzColumnDefs as generateSqliteTzColumnDefs,
  generateUserAuditColumnDefs as generateSqliteUserAuditColumnDefs,
} from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';

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

/**
 * The same stamps, through a generated CRUD route on a real database. A client body can no longer
 * name the audit user or time: the factory's default create and update bodies drop those keys, zod
 * strips them from the request, and the enricher stamps the signed-in user instead.
 */
const POSTGRES_ROUTE_TABLE = 'pg_user_audit_route';
const SQLITE_ROUTE_TABLE = 'libsql_user_audit_route';

const postgresRouteTable = pgTable(POSTGRES_ROUTE_TABLE, {
  id: pgText('id').primaryKey(),
  code: pgText('code').notNull(),
  ...generatePostgresTzColumnDefs(),
  ...generatePostgresUserAuditColumnDefs(buildColumnOpts({ allowAnonymous: true })),
});

const sqliteRouteTable = sqliteTable(SQLITE_ROUTE_TABLE, {
  id: sqliteText('id').primaryKey(),
  code: sqliteText('code').notNull(),
  ...generateSqliteTzColumnDefs(),
  ...generateSqliteUserAuditColumnDefs(buildColumnOpts({ allowAnonymous: true })),
});

@model({ type: 'entity' })
class PostgresRouteRow extends BasePostgresEntity<typeof postgresRouteTable> {
  static override TABLE_NAME = POSTGRES_ROUTE_TABLE;
  static override schema = postgresRouteTable;
}

@model({ type: 'entity' })
class SqliteRouteRow extends BaseSqliteEntity {
  static override TABLE_NAME = SQLITE_ROUTE_TABLE;
  static override schema = sqliteRouteTable;
}

@datasource({ driver: PGliteDriver })
class PostgresRouteDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: PostgresRouteDataSource.name,
      config: {},
      schema: { [POSTGRES_ROUTE_TABLE]: postgresRouteTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

@datasource({ driver: LibSqlDriver })
class SqliteRouteDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: SqliteRouteDataSource.name,
      config: { url: ':memory:' },
      schema: { [SQLITE_ROUTE_TABLE]: sqliteRouteTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

interface IRouteTier {
  name: string;
  open: () => Promise<{ repository: AnyType; close: () => Promise<void> }>;
  entity: AnyType;
}

const ROUTE_TIERS: IRouteTier[] = [
  {
    name: 'postgres (PGlite)',
    entity: PostgresRouteRow,
    open: async () => {
      const client = new PGlite();
      await client.waitReady;
      await client.exec(`
        CREATE TABLE ${POSTGRES_ROUTE_TABLE} (
          id text primary key,
          code text not null,
          created_at timestamptz not null default now(),
          modified_at timestamptz not null default now(),
          created_by integer,
          modified_by integer
        );
      `);

      const dataSource = new PostgresRouteDataSource({ client });
      return {
        repository: new DefaultCRUDRepository<
          typeof postgresRouteTable,
          TTableObject<typeof postgresRouteTable>,
          TTableInsert<typeof postgresRouteTable>,
          IDatabaseExtraOptions,
          PostgresRouteDataSource
        >(dataSource, { entityClass: PostgresRouteRow }),
        close: () => dataSource.endDriver(),
      };
    },
  },
  {
    name: 'sqlite (libsql :memory:)',
    entity: SqliteRouteRow,
    open: async () => {
      const client = createClient({ url: ':memory:' });
      await client.execute(`
        CREATE TABLE ${SQLITE_ROUTE_TABLE} (
          id text primary key,
          code text not null,
          created_at text not null,
          modified_at text not null,
          created_by integer,
          modified_by integer
        )
      `);

      const dataSource = new SqliteRouteDataSource({ client });
      return {
        repository: new DefaultSqliteRepository<AnyType>(dataSource, {
          entityClass: SqliteRouteRow,
        }),
        close: async () => client.close(),
      };
    },
  },
];

const FORGED_TIME = '2000-01-01T00:00:00.000Z';

describe.each(ROUTE_TIERS)('a generated CRUD route on $name stamps the signed-in user', tier => {
  let repository: AnyType;
  let close: () => Promise<void>;
  let router: AnyType;

  beforeAll(async () => {
    ({ repository, close } = await tier.open());

    const RouteController = ControllerFactory.defineCrudController({
      entity: tier.entity,
      repository: { name: `${tier.entity.name}Repository` },
      controller: { name: `${tier.entity.name}Controller`, basePath: '/rows' },
    });

    const controller = new RouteController(repository);
    await controller.configure();
    router = controller.getRouter();
    // The handler an application installs on its server: without it a thrown `getError` is a bare 500.
    router.onError(new BaseAppErrorMiddleware().value());
  });

  afterAll(async () => {
    RequestContextRegistry.clearResolver();
    await close();
  });

  const signIn = (opts: { userId: number }) => {
    RequestContextRegistry.setResolver({ resolver: () => buildContext({ userId: opts.userId }) });
  };

  const request = (opts: { method: string; path: string; body: object }): Promise<Response> => {
    return router.request(opts.path, {
      method: opts.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
    });
  };

  const send = async (opts: { method: string; path: string; body: object }) => {
    const response = await request(opts);
    return response.status;
  };

  const readRow = async (opts: { id: string }) => {
    const row = await repository.findById({ id: opts.id });
    return row
      ? {
          id: row.id,
          code: row.code,
          createdBy: row.createdBy,
          modifiedBy: row.modifiedBy,
          createdAt: new Date(row.createdAt).toISOString(),
          modifiedAt: new Date(row.modifiedAt).toISOString(),
        }
      : null;
  };

  test('POST ignores a forged createdBy, modifiedBy and createdAt', async () => {
    signIn({ userId: 42 });

    const status = await send({
      method: 'POST',
      path: '/',
      body: {
        id: 'forged-post',
        code: 'THEME',
        createdBy: 999,
        modifiedBy: 998,
        createdAt: FORGED_TIME,
      },
    });

    expect(status).toBe(201);
    const row = await readRow({ id: 'forged-post' });
    expect(row).toMatchObject({ code: 'THEME', createdBy: 42, modifiedBy: 42 });
    expect(row?.createdAt).not.toBe(FORGED_TIME);
  });

  test('PATCH /:id ignores a forged createdBy and modifiedBy, and keeps the creator', async () => {
    signIn({ userId: 42 });
    await send({ method: 'POST', path: '/', body: { id: 'forged-patch', code: 'BEFORE' } });

    signIn({ userId: 43 });
    const status = await send({
      method: 'PATCH',
      path: '/forged-patch',
      body: { code: 'AFTER', createdBy: 999, modifiedBy: 998 },
    });

    expect(status).toBe(200);
    expect(await readRow({ id: 'forged-patch' })).toMatchObject({
      code: 'AFTER',
      createdBy: 42,
      modifiedBy: 43,
    });
  });

  test('PATCH / with a where ignores a forged createdBy and modifiedBy', async () => {
    signIn({ userId: 42 });
    await send({ method: 'POST', path: '/', body: { id: 'forged-bulk', code: 'BULK' } });

    signIn({ userId: 44 });
    const status = await send({
      method: 'PATCH',
      path: '/',
      body: { where: { id: 'forged-bulk' }, code: 'BULK-AFTER', createdBy: 999, modifiedBy: 998 },
    });

    expect(status).toBe(200);
    expect(await readRow({ id: 'forged-bulk' })).toMatchObject({
      code: 'BULK-AFTER',
      createdBy: 42,
      modifiedBy: 44,
    });
  });

  test('a body without the audit keys still creates and updates', async () => {
    signIn({ userId: 45 });

    expect(await send({ method: 'POST', path: '/', body: { id: 'plain', code: 'PLAIN' } })).toBe(
      201,
    );
    expect(await send({ method: 'PATCH', path: '/plain', body: { code: 'PLAIN-AFTER' } })).toBe(
      200,
    );
    expect(await readRow({ id: 'plain' })).toMatchObject({
      code: 'PLAIN-AFTER',
      createdBy: 45,
      modifiedBy: 45,
    });
  });

  test('echoing the stored record back cannot pin modifiedAt or rename the row', async () => {
    signIn({ userId: 42 });
    await send({ method: 'POST', path: '/', body: { id: 'echoed', code: 'ECHO' } });
    const stored = await readRow({ id: 'echoed' });
    await Bun.sleep(5);

    signIn({ userId: 46 });
    const status = await send({
      method: 'PATCH',
      path: '/echoed',
      body: { ...stored, id: 'renamed', code: 'ECHO-AFTER' },
    });

    expect(status).toBe(200);
    expect(await readRow({ id: 'renamed' })).toBeNull();
    const row = await readRow({ id: 'echoed' });
    expect(row).toMatchObject({ code: 'ECHO-AFTER', createdBy: 42, modifiedBy: 46 });
    expect(row?.modifiedAt).not.toBe(stored?.modifiedAt);
  });

  /** Keys the default update body drops, so a body holding only these reaches the handler empty. */
  const DROPPED_ONLY = {
    id: 'renamed',
    createdBy: 999,
    modifiedBy: 998,
    createdAt: FORGED_TIME,
    modifiedAt: FORGED_TIME,
  };

  test.each([
    ['a literal {}', 'empty-by-id-literal', {}],
    ['only keys the default body drops', 'empty-by-id-dropped', DROPPED_ONLY],
  ])(
    'PATCH /:id with %s answers 400 and never reaches the repository',
    async (_label, id, body) => {
      signIn({ userId: 42 });
      await send({ method: 'POST', path: '/', body: { id, code: 'KEEP' } });
      const updateById = spyOn(repository, 'updateById');

      try {
        const response = await request({ method: 'PATCH', path: `/${id}`, body });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          normalized: { code: 'core.request.nothing_to_update' },
        });
        expect(updateById).not.toHaveBeenCalled();
      } finally {
        updateById.mockRestore();
      }

      expect(await readRow({ id })).toMatchObject({ code: 'KEEP', createdBy: 42, modifiedBy: 42 });
    },
  );

  test.each([
    ['a where alone', 'empty-by-where-literal', {}],
    ['a where and only keys the default body drops', 'empty-by-where-dropped', DROPPED_ONLY],
  ])('PATCH / with %s answers 400 and never reaches the repository', async (_label, id, extra) => {
    signIn({ userId: 42 });
    await send({ method: 'POST', path: '/', body: { id, code: 'KEEP' } });
    const updateBy = spyOn(repository, 'updateBy');

    try {
      const response = await request({
        method: 'PATCH',
        path: '/',
        body: { where: { id }, ...extra },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        normalized: { code: 'core.request.nothing_to_update' },
      });
      expect(updateBy).not.toHaveBeenCalled();
    } finally {
      updateBy.mockRestore();
    }

    expect(await readRow({ id })).toMatchObject({ code: 'KEEP', createdBy: 42, modifiedBy: 42 });
  });
});
