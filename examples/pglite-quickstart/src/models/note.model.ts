import { model } from '@venizia/ignis';
import { BasePostgresEntity, generateIdColumnDefs, TTableObject } from '@venizia/ignis/postgres';
import { jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class Note extends BasePostgresEntity<TNoteSchema> {
  static override readonly TABLE_NAME = 'notes';

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- table declared below
    super({ name: Note.TABLE_NAME, schema: notesTable });
  }
}

/**
 * `uuid`, `jsonb` and `timestamptz` have no SQLite equivalent.
 * PGlite is real Postgres, so they work unchanged.
 */
export const notesTable = pgTable(Note.TABLE_NAME, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: varchar('title', { length: 200 }).notNull(),
  body: varchar('body', { length: 2000 }),
  metadata: jsonb('metadata').$type<{ tags?: string[]; pinned?: boolean }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TNoteSchema = typeof notesTable;
export type TNote = TTableObject<TNoteSchema>;
