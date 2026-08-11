import { model } from '@venizia/ignis';
import {
  BaseSqliteEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  TTableObject,
} from '@venizia/ignis/sqlite';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

@model({ type: 'entity' })
export class Note extends BaseSqliteEntity<TNoteSchema> {
  static override readonly TABLE_NAME = 'notes';

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- table declared below
    super({ name: Note.TABLE_NAME, schema: notesTable });
  }
}

/**
 * SQLite has five storage classes, so the Postgres shapes have neighbours rather than equivalents:
 * a text id instead of `uuid`, `text({ mode: 'json' })` instead of `jsonb`, and an ISO-8601 string
 * instead of `timestamptz`.
 */
export const notesTable = sqliteTable(Note.TABLE_NAME, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
  body: text('body'),
  metadata: text('metadata', { mode: 'json' }).$type<{ tags?: string[]; pinned?: boolean }>(),

  // The enricher owns the `strftime` default expression. Reaching for `ISO_TIMESTAMP_NOW` directly
  // needs `sql.raw()` around it, or `.default()` stores the SQL text as the column value.
  ...generateTzColumnDefs({ modified: { enable: false }, deleted: { enable: false } }),
});

export type TNoteSchema = typeof notesTable;
export type TNote = TTableObject<TNoteSchema>;
