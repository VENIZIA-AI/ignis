import { extraPermissionColumns, model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

export const permissionTable = pgTable('Permission', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...extraPermissionColumns({ idType: 'string' }),
});

@model({ type: 'entity' })
export class Permission extends ModelFactory.defineEntity({ table: permissionTable }) {}

export type TPermission = TEntityObject<typeof Permission>;
