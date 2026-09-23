import { extraUserColumns, model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...extraUserColumns({ idType: 'string' }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password'),
  secret: text('secret'),
});

/** `hiddenProperties` keeps `password` and `secret` out of every repository read and write response. */
@model({ type: 'entity', settings: { hiddenProperties: ['password', 'secret'] } })
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
