import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  many,
  ModelFactory,
  one,
  TEntityObject,
} from '@venizia/ignis/sqlite';
import { AnySQLiteColumn, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// SQLite has no `jsonb` or `timestamptz` storage class, so both become text columns.
export const noteTable = sqliteTable('notes', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  title: text('title').notNull(),
  body: text('body'),
  metadata: text('metadata', { mode: 'json' }).$type<{ tags?: string[]; pinned?: boolean }>(),
  ...generateTzColumnDefs({ modified: { enable: false }, deleted: { enable: false } }),
});

export const commentTable = sqliteTable('comments', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  noteId: text('note_id')
    .notNull()
    .references((): AnySQLiteColumn => noteTable.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
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
