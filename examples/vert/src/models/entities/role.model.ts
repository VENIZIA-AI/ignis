import { extraRoleColumns, model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

export const roleTable = pgTable('Role', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...extraRoleColumns(),
});

@model()
export class Role extends ModelFactory.defineEntity({ table: roleTable }) {}

export type TRole = TEntityObject<typeof Role>;
