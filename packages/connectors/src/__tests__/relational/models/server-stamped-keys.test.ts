import { describe, expect, test } from 'bun:test';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { ControllerFactory } from '@venizia/ignis-kernel';
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

const ENRICHED_KEYS = ['createdBy', 'modifiedBy', 'createdAt', 'modifiedAt'];
const SOFT_DELETE_KEY = 'deletedAt';

const postgresEnrichedTable = pgTable('stamped_keys_pg_enriched', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  status: text('status').default('draft'),
  ...PostgresTzEnricher.generateColumnDefs({
    deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
  }),
  ...PostgresUserAuditEnricher.generateColumnDefs(),
});

class PostgresEnrichedRow extends BasePostgresEntity<typeof postgresEnrichedTable> {
  static override schema = postgresEnrichedTable;
}

const sqliteEnrichedTable = sqliteTable('stamped_keys_sqlite_enriched', {
  id: sqliteText('id').primaryKey(),
  code: sqliteText('code').notNull(),
  ...SqliteTzEnricher.generateColumnDefs({ deleted: { enable: true, columnName: 'deleted_at' } }),
  ...SqliteUserAuditEnricher.generateColumnDefs(),
});

class SqliteEnrichedRow extends BaseSqliteEntity<typeof sqliteEnrichedTable> {
  static override schema = sqliteEnrichedTable;
}

/** `modifiedAt` switched off: only the creation time is stamped. */
const createdOnlyTable = pgTable('stamped_keys_created_only', {
  id: text('id').primaryKey(),
  ...PostgresTzEnricher.generateColumnDefs({ modified: { enable: false } }),
});

class CreatedOnlyRow extends BasePostgresEntity<typeof createdOnlyTable> {
  static override schema = createdOnlyTable;
}

/** Audit names declared by hand: a constant default and a `$onUpdate` stamp; a bare NOT NULL does not. */
const handDeclaredTable = pgTable('stamped_keys_hand_declared', {
  id: text('id').primaryKey(),
  createdBy: text('created_by').notNull(),
  modifiedBy: text('modified_by').default('SYSTEM'),
  modifiedAt: integer('modified_at').$onUpdate(() => Date.now()),
});

class HandDeclaredRow extends BasePostgresEntity<typeof handDeclaredTable> {
  static override schema = handDeclaredTable;
}

/** The body a generated route documents, read from the controller's own OpenAPI document. */
const toCreateBody = async (opts: { entity: typeof HandDeclaredRow }) => {
  const HandDeclaredController = ControllerFactory.defineCrudController({
    entity: opts.entity,
    repository: { name: 'HandDeclaredRowRepository' },
    controller: { name: 'HandDeclaredRowController', basePath: '/hand-declared' },
  });
  const controller = new HandDeclaredController(
    new DefaultCRUDRepository<typeof handDeclaredTable>(undefined, { entityClass: opts.entity }),
  );
  const router = await controller.configure();
  const document = router.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'server-stamped-keys', version: '1' },
  });

  return document.paths?.['/']?.post?.requestBody;
};

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

describe('the generated create and update bodies leave deletedAt out, with the audit stamps', () => {
  test('on postgres', async () => {
    const PostgresController = ControllerFactory.defineCrudController({
      entity: PostgresEnrichedRow,
      repository: { name: 'PostgresEnrichedRowRepository' },
      controller: { name: 'PostgresEnrichedRowController', basePath: '/rows' },
    });
    const controller = new PostgresController(
      new DefaultCRUDRepository<typeof postgresEnrichedTable>(undefined, {
        entityClass: PostgresEnrichedRow,
      }),
    );
    const document = documentOf({ router: await controller.configure() });

    expect(bodyKeysOf({ requestBody: document.paths?.['/']?.post?.requestBody })).toEqual([
      'code',
      'id',
      'status',
    ]);
    expect(bodyKeysOf({ requestBody: document.paths?.['/{id}']?.patch?.requestBody })).toEqual([
      'code',
      'status',
    ]);
  });

  test('on sqlite', async () => {
    const SqliteController = ControllerFactory.defineCrudController({
      entity: SqliteEnrichedRow,
      repository: { name: 'SqliteEnrichedRowRepository' },
      controller: { name: 'SqliteEnrichedRowController', basePath: '/rows' },
    });
    const controller = new SqliteController(
      new DefaultSqliteRepository<typeof sqliteEnrichedTable>(undefined, {
        entityClass: SqliteEnrichedRow,
      }),
    );
    const document = documentOf({ router: await controller.configure() });

    expect(bodyKeysOf({ requestBody: document.paths?.['/']?.post?.requestBody })).toEqual([
      'code',
      'id',
    ]);
    expect(bodyKeysOf({ requestBody: document.paths?.['/{id}']?.patch?.requestBody })).toEqual([
      'code',
    ]);
  });
});

describe('a relational entity reports the audit keys its columns stamp', () => {
  test('the user-audit and timestamp enrichers stamp all four, on either engine', () => {
    expect(new PostgresEnrichedRow().getServerStampedKeys()).toEqual([
      ...ENRICHED_KEYS,
      SOFT_DELETE_KEY,
    ]);
    expect(new SqliteEnrichedRow().getServerStampedKeys()).toEqual([
      ...ENRICHED_KEYS,
      SOFT_DELETE_KEY,
    ]);
  });

  test('a deletedAt column is reported too, on either engine, and a table without one does not report it', () => {
    expect(new PostgresEnrichedRow().getServerStampedKeys()).toContain(SOFT_DELETE_KEY);
    expect(new SqliteEnrichedRow().getServerStampedKeys()).toContain(SOFT_DELETE_KEY);
    expect(new CreatedOnlyRow().getServerStampedKeys()).not.toContain(SOFT_DELETE_KEY);
    expect(new HandDeclaredRow().getServerStampedKeys()).not.toContain(SOFT_DELETE_KEY);
  });

  test('a timestamp enricher without modifiedAt stamps createdAt alone', () => {
    expect(new CreatedOnlyRow().getServerStampedKeys()).toEqual(['createdAt']);
  });

  test('a hand-declared audit column counts only with a default or $onUpdate', () => {
    expect(new HandDeclaredRow().getServerStampedKeys()).toEqual(['modifiedBy', 'modifiedAt']);
  });

  test('a NOT NULL createdBy with no default stays in the POST body, so a client can supply it', async () => {
    const result = await toCreateBody({ entity: HandDeclaredRow });
    expect(result).toMatchObject({
      content: {
        'application/json': {
          schema: { properties: { createdBy: {} }, required: ['id', 'createdBy'] },
        },
      },
    });
  });
});
