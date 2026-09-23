import { model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory, TEntityObject } from '@venizia/ignis/postgres';
import { jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * `jsonb` and `timestamptz` have no SQLite equivalent. PGlite is real Postgres, so they work
 * unchanged. The id is a UUID v7 text key.
 */
export const notesTable = pgTable('notes', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: varchar('title', { length: 200 }).notNull(),
  body: varchar('body', { length: 2000 }),
  metadata: jsonb('metadata').$type<{ tags?: string[]; pinned?: boolean }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The entity takes its name, id and row type from the table - each stated once. */
@model({ type: 'entity' })
export class Note extends ModelFactory.defineEntity({ table: notesTable }) {}

export type TNoteSchema = typeof notesTable;
export type TNote = TEntityObject<typeof Note>;
