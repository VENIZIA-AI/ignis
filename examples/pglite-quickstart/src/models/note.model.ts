import { model } from '@venizia/ignis';
import { TEntityObject, ModelFactory } from '@venizia/ignis/postgres';
import { jsonb, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * `jsonb` and `timestamptz` have no SQLite equivalent. PGlite is real Postgres, so they work
 * unchanged.
 *
 * The table, its name and its UUID v7 id come from one declaration - `defineEntity` builds the
 * `pgTable` and the class that carries it.
 */
@model({ type: 'entity' })
export class Note extends ModelFactory.defineEntity({
  name: 'notes',
  columns: {
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 2000 }),
    metadata: jsonb('metadata').$type<{ tags?: string[]; pinned?: boolean }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
}) {}

export const notesTable = Note.schema;
export type TNoteSchema = typeof Note.schema;
export type TNote = TEntityObject<typeof Note>;
