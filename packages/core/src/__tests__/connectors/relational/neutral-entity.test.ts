import { describe, expect, test } from 'bun:test';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { BaseRelationalEntity } from '@/connectors/relational/models';
import { SchemaTypes } from '@/base/models';

const notesTable = sqliteTable('notes', {
  id: integer('id').primaryKey(),
  body: text('body').notNull(),
});

class Note extends BaseRelationalEntity<typeof notesTable> {
  static override TABLE_NAME = 'notes';
  static override schema = notesTable;
}

describe('BaseRelationalEntity accepts a non-Postgres table', () => {
  test('constructs and reports its id type', () => {
    const note = new Note();
    expect(note.name).toBe('notes');
    expect(note.getIdType()).toBe('number');
  });

  test('derives a zod select schema through drizzle-zod', () => {
    const schema = new Note().getSchema<{ parse: (v: unknown) => unknown }>({
      type: SchemaTypes.SELECT,
    });
    expect(schema.parse({ id: 1, body: 'hello' })).toEqual({ id: 1, body: 'hello' });
  });
});
