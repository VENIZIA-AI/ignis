import { describe, expect, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import {
  DefaultCRUDRepository,
  PersistableRepository,
  ReadableRepository,
  SoftDeletableRepository,
} from '@/relational/postgres';

const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
});
type TUserSchema = typeof usersTable;

/** `SoftDeletableRepository`'s schema bound requires a `deletedAt` column. */
const softUsersTable = pgTable('soft_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  deletedAt: timestamp('deleted_at'),
});
type TSoftUserSchema = typeof softUsersTable;

describe('one explicit type argument still compiles', () => {
  test('the four public repository aliases accept a single schema argument', () => {
    class ReadOnly extends ReadableRepository<TUserSchema> {}
    class Writable extends PersistableRepository<TUserSchema> {}
    class Crud extends DefaultCRUDRepository<TUserSchema> {}
    class Soft extends SoftDeletableRepository<TSoftUserSchema> {}

    expect(ReadOnly.name).toBe('ReadOnly');
    expect(Writable.name).toBe('Writable');
    expect(Crud.name).toBe('Crud');
    expect(Soft.name).toBe('Soft');

    // The fixtures are real Drizzle tables, not type-only stand-ins.
    expect(getTableName(usersTable)).toBe('users');
    expect(getTableName(softUsersTable)).toBe('soft_users');
  });
});
