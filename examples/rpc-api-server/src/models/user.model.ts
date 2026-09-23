import { model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory, TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

// No controller exposes this table: only `AuthenticationService` reads it, so the hash never
// leaves the server.
export const userTable = pgTable('users', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
});

@model({ type: 'entity' })
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
