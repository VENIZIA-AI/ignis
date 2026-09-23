import { describe, expect, test } from 'bun:test';
import { ControllerFactory } from '@venizia/ignis-kernel';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import {
  BasePostgresEntity,
  generateTzColumnDefs as generatePostgresTzColumnDefs,
  generateUserAuditColumnDefs as generatePostgresUserAuditColumnDefs,
} from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import {
  BaseSqliteEntity,
  generateTzColumnDefs as generateSqliteTzColumnDefs,
  generateUserAuditColumnDefs as generateSqliteUserAuditColumnDefs,
} from '@/relational/sqlite/models';

const ENRICHED_KEYS = ['createdBy', 'modifiedBy', 'createdAt', 'modifiedAt'];

const postgresEnrichedTable = pgTable('stamped_keys_pg_enriched', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  status: text('status').default('draft'),
  ...generatePostgresTzColumnDefs({
    deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
  }),
  ...generatePostgresUserAuditColumnDefs(),
});

class PostgresEnrichedRow extends BasePostgresEntity<typeof postgresEnrichedTable> {
  static override schema = postgresEnrichedTable;
}

const sqliteEnrichedTable = sqliteTable('stamped_keys_sqlite_enriched', {
  id: sqliteText('id').primaryKey(),
  ...generateSqliteTzColumnDefs(),
  ...generateSqliteUserAuditColumnDefs(),
});

class SqliteEnrichedRow extends BaseSqliteEntity<typeof sqliteEnrichedTable> {
  static override schema = sqliteEnrichedTable;
}

/** `modifiedAt` switched off: only the creation time is stamped. */
const createdOnlyTable = pgTable('stamped_keys_created_only', {
  id: text('id').primaryKey(),
  ...generatePostgresTzColumnDefs({ modified: { enable: false } }),
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

describe('a relational entity reports the audit keys its columns stamp', () => {
  test('the user-audit and timestamp enrichers stamp all four, on either engine', () => {
    expect(new PostgresEnrichedRow().getServerStampedKeys()).toEqual(ENRICHED_KEYS);
    expect(new SqliteEnrichedRow().getServerStampedKeys()).toEqual(ENRICHED_KEYS);
  });

  test('a timestamp enricher without modifiedAt stamps createdAt alone', () => {
    expect(new CreatedOnlyRow().getServerStampedKeys()).toEqual(['createdAt']);
  });

  test('a hand-declared audit column counts only with a default or $onUpdate', () => {
    expect(new HandDeclaredRow().getServerStampedKeys()).toEqual(['modifiedBy', 'modifiedAt']);
  });

  test('a NOT NULL createdBy with no default stays in the POST body, so a client can supply it', async () => {
    expect(await toCreateBody({ entity: HandDeclaredRow })).toMatchObject({
      content: {
        'application/json': {
          schema: { properties: { createdBy: {} }, required: ['id', 'createdBy'] },
        },
      },
    });
  });
});
