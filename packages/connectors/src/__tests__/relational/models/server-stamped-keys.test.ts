import { describe, expect, test } from 'bun:test';
import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  controller,
  CrudControllerFactory,
  model,
  repository as repositoryDecorator,
} from '@venizia/ignis-kernel';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import {
  BasePostgresEntity,
  PostgresTzEnricher,
  PostgresUserAuditEnricher,
} from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import {
  BaseSqliteEntity,
  SqliteTzEnricher,
  SqliteUserAuditEnricher,
} from '@/relational/sqlite/models';

const postgresTable = pgTable('stamped_keys_pg', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  status: text('status').default('draft'),
  ...PostgresTzEnricher.generateColumnDefs({
    deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
  }),
  ...PostgresUserAuditEnricher.generateColumnDefs(),
});

class PostgresRow extends BasePostgresEntity<typeof postgresTable> {
  static override schema = postgresTable;
}

/** Declares `status` and `createdAt` as the stamped keys, as a Set: the default list no longer applies. */
@model({ settings: { properties: { stamped: new Set(['status', 'createdAt']) } } })
class PostgresOverriddenRow extends PostgresRow {}

/** Declares that nothing is stamped. */
@model({ settings: { properties: { stamped: [] } } })
class PostgresUnstampedRow extends PostgresRow {}

const sqliteEnrichedTable = sqliteTable('stamped_keys_sqlite', {
  id: sqliteText('id').primaryKey(),
  code: sqliteText('code').notNull(),
  ...SqliteTzEnricher.generateColumnDefs({ deleted: { enable: true, columnName: 'deleted_at' } }),
  ...SqliteUserAuditEnricher.generateColumnDefs(),
});

class SqliteRow extends BaseSqliteEntity<typeof sqliteEnrichedTable> {
  static override schema = sqliteEnrichedTable;
}

/** Audit names declared by hand, with no default and no `$onUpdate`. */
const handDeclaredTable = pgTable('stamped_keys_hand_declared', {
  id: text('id').primaryKey(),
  createdBy: text('created_by').notNull(),
  modifiedAt: integer('modified_at'),
});

class HandDeclaredRow extends BasePostgresEntity<typeof handDeclaredTable> {
  static override schema = handDeclaredTable;
}

@model({ settings: { properties: { stamped: [] } } })
class HandDeclaredUnstampedRow extends HandDeclaredRow {}

@repositoryDecorator({ model: PostgresRow, dataSource: 'StampedDataSource' })
class PostgresRowRepository extends DefaultCRUDRepository<typeof postgresTable> {}

@repositoryDecorator({ model: PostgresOverriddenRow, dataSource: 'StampedDataSource' })
class PostgresOverriddenRowRepository extends DefaultCRUDRepository<typeof postgresTable> {}

@repositoryDecorator({ model: PostgresUnstampedRow, dataSource: 'StampedDataSource' })
class PostgresUnstampedRowRepository extends DefaultCRUDRepository<typeof postgresTable> {}

@repositoryDecorator({ model: SqliteRow, dataSource: 'StampedDataSource' })
class SqliteRowRepository extends DefaultSqliteRepository<typeof sqliteEnrichedTable> {}

@repositoryDecorator({ model: HandDeclaredRow, dataSource: 'StampedDataSource' })
class HandDeclaredRowRepository extends DefaultCRUDRepository<typeof handDeclaredTable> {}

@repositoryDecorator({ model: HandDeclaredUnstampedRow, dataSource: 'StampedDataSource' })
class HandDeclaredUnstampedRowRepository extends DefaultCRUDRepository<typeof handDeclaredTable> {}

/** The property names of the JSON body one generated write route documents. */
const bodyKeysOf = (opts: { requestBody: unknown }): string[] => {
  const body = z
    .object({
      content: z.object({
        'application/json': z.object({
          schema: z.object({ properties: z.record(z.string(), z.unknown()) }),
        }),
      }),
    })
    .parse(opts.requestBody);

  return Object.keys(body.content['application/json'].schema.properties).sort();
};

const documentOf = (opts: { router: OpenAPIHono }) =>
  opts.router.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'write-bodies', version: '1' },
  });

const postgresBodies = async (opts: {
  entity: typeof PostgresRow;
  repositoryClass: typeof PostgresRowRepository;
}) => {
  const Controller = CrudControllerFactory.build({
    repository: opts.repositoryClass,
    routes: { create: true, updateById: true },
  });

  @controller({ path: '/rows' })
  class RowsController extends Controller {}

  const crudController = new RowsController(
    new opts.repositoryClass(undefined, { entityClass: opts.entity }),
  );
  const router = await crudController.configure();
  const document = documentOf({ router });

  return {
    create: bodyKeysOf({ requestBody: document.paths?.['/']?.post?.requestBody }),
    update: bodyKeysOf({ requestBody: document.paths?.['/{id}']?.patch?.requestBody }),
  };
};

const handDeclaredBodies = async (opts: {
  entity: typeof HandDeclaredRow;
  repositoryClass: typeof HandDeclaredRowRepository;
}) => {
  const Controller = CrudControllerFactory.build({
    repository: opts.repositoryClass,
    routes: { create: true },
  });

  @controller({ path: '/rows' })
  class RowsController extends Controller {}

  const crudController = new RowsController(
    new opts.repositoryClass(undefined, { entityClass: opts.entity }),
  );
  const router = await crudController.configure();
  const document = documentOf({ router });

  return bodyKeysOf({ requestBody: document.paths?.['/']?.post?.requestBody });
};

describe('the generated write bodies leave out the stamped keys', () => {
  test('by default: the audit keys and deletedAt, on postgres', async () => {
    const { create, update } = await postgresBodies({
      entity: PostgresRow,
      repositoryClass: PostgresRowRepository,
    });

    expect(create).toEqual(['code', 'id', 'status']);
    expect(update).toEqual(['code', 'status']);
  });

  test('by default: the audit keys and deletedAt, on sqlite', async () => {
    const Controller = CrudControllerFactory.build({
      repository: SqliteRowRepository,
      routes: { create: true, updateById: true },
    });

    @controller({ path: '/rows' })
    class SqliteRowsController extends Controller {}

    const crudController = new SqliteRowsController(
      new SqliteRowRepository(undefined, { entityClass: SqliteRow }),
    );
    const router = await crudController.configure();
    const document = documentOf({ router });

    expect(bodyKeysOf({ requestBody: document.paths?.['/']?.post?.requestBody })).toEqual([
      'code',
      'id',
    ]);
    expect(bodyKeysOf({ requestBody: document.paths?.['/{id}']?.patch?.requestBody })).toEqual([
      'code',
    ]);
  });

  test('a model that declares properties.stamped replaces the default list, as an array or a Set', async () => {
    const { create, update } = await postgresBodies({
      entity: PostgresOverriddenRow,
      repositoryClass: PostgresOverriddenRowRepository,
    });

    expect(create).toEqual(['code', 'createdBy', 'deletedAt', 'id', 'modifiedAt', 'modifiedBy']);
    expect(update).toEqual(['code', 'createdBy', 'deletedAt', 'modifiedAt', 'modifiedBy']);
  });

  test('stamped: [] leaves every key in the bodies', async () => {
    const { create, update } = await postgresBodies({
      entity: PostgresUnstampedRow,
      repositoryClass: PostgresUnstampedRowRepository,
    });

    expect(create).toEqual([
      'code',
      'createdAt',
      'createdBy',
      'deletedAt',
      'id',
      'modifiedAt',
      'modifiedBy',
      'status',
    ]);
    expect(update).toEqual([
      'code',
      'createdAt',
      'createdBy',
      'deletedAt',
      'modifiedAt',
      'modifiedBy',
      'status',
    ]);
  });

  test('a hand-declared audit column is dropped by default and kept with stamped: []', async () => {
    const byDefault = await handDeclaredBodies({
      entity: HandDeclaredRow,
      repositoryClass: HandDeclaredRowRepository,
    });
    const unstamped = await handDeclaredBodies({
      entity: HandDeclaredUnstampedRow,
      repositoryClass: HandDeclaredUnstampedRowRepository,
    });

    expect(byDefault).toEqual(['id']);
    expect(unstamped).toEqual(['createdBy', 'id', 'modifiedAt']);
  });
});
