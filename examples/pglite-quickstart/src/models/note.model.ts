import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  many,
  ModelFactory,
  one,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { AnyPgColumn, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// PGlite is real Postgres, so `jsonb` and `timestamptz` work unchanged.
export const noteTable = pgTable('notes', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: varchar('title', { length: 200 }).notNull(),
  body: varchar('body', { length: 2000 }),
  metadata: jsonb('metadata').$type<{ tags?: string[]; pinned?: boolean }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commentTable = pgTable('comments', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  noteId: text('note_id')
    .notNull()
    .references((): AnyPgColumn => noteTable.id, { onDelete: 'cascade' }),
  text: varchar('text', { length: 2000 }).notNull(),
});

@model({ type: 'entity' })
export class Note extends ModelFactory.defineEntity({
  table: noteTable,
  relations: () => ({ comments: many(commentTable, { relationName: 'note' }) }),
}) {}

/** `one(noteTable)` reads its columns off the single foreign key `note_id`. */
@model({ type: 'entity' })
export class Comment extends ModelFactory.defineEntity({
  table: commentTable,
  relations: () => ({ note: one(noteTable) }),
}) {}

export type TNote = TEntityObject<typeof Note>;
export type TComment = TEntityObject<typeof Comment>;
