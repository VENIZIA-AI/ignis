import { AuthModelColumns, model } from '@venizia/ignis';
import {
  PostgresIdEnricher,
  PostgresTzEnricher,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('User', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  ...PostgresTzEnricher.generateColumnDefs(),
  ...AuthModelColumns.buildUser({ idType: 'string' }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password'),
  secret: text('secret'),
});

/** `hiddenProperties` keeps `password` and `secret` out of every repository read and write response. */
@model({ settings: { hiddenProperties: ['password', 'secret'] } })
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
