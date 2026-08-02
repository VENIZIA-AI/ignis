import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import type { TTableSchemaWithId } from '@/connectors/relational/models/common';
import { getIdType } from '@/connectors/relational/models/common';

const postgresUsers = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
});

const sqliteUsers = sqliteTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
});

describe('TTableSchemaWithId is engine-neutral', () => {
  test('a pgTable satisfies the neutral bound', () => {
    const schema: TTableSchemaWithId = postgresUsers;
    expect(getIdType({ entity: schema })).toBe('number');
  });

  // This is the assertion that fails today: the bound is PgTable, so a sqliteTable is rejected.
  test('a sqliteTable satisfies the neutral bound', () => {
    const schema: TTableSchemaWithId = sqliteUsers;
    expect(getIdType({ entity: schema })).toBe('number');
  });

  test('$inferSelect and $inferInsert survive the widening', () => {
    const selected: (typeof postgresUsers)['$inferSelect'] = { id: 1, email: 'a@b.c' };
    const inserted: (typeof sqliteUsers)['$inferInsert'] = { email: 'a@b.c' };
    expect(selected.email).toBe('a@b.c');
    expect(inserted.email).toBe('a@b.c');
  });
});
