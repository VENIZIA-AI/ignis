import { AuthModelColumns, model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

export const permissionTable = pgTable('Permission', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...AuthModelColumns.buildPermission({ idType: 'string' }),
});

@model()
export class Permission extends ModelFactory.defineEntity({ table: permissionTable }) {}

export type TPermission = TEntityObject<typeof Permission>;
