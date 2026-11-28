import { model } from '@venizia/ignis';
import {
  ModelFactory,
  PostgresIdEnricher,
  type TEntityObject,
} from '@venizia/ignis-connectors/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('users', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
});

/** A user. Only `AuthService` and the seed read it: no RPC answers it, so the hash never leaves the server. */
@model()
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
