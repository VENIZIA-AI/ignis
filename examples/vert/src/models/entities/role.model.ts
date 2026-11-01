import { AuthModelColumns, model } from '@venizia/ignis';
import {
  PostgresIdEnricher,
  PostgresTzEnricher,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

export const roleTable = pgTable('Role', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...AuthModelColumns.buildRole(),
});

@model()
export class Role extends ModelFactory.defineEntity({ table: roleTable }) {}

export type TRole = TEntityObject<typeof Role>;
