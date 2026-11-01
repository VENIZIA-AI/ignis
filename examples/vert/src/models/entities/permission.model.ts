import { extraPermissionColumns, model } from '@venizia/ignis';
import {
  PostgresIdEnricher,
  PostgresTzEnricher,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

export const permissionTable = pgTable('Permission', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  ...PostgresTzEnricher.generateColumnDefs(),
  ...extraPermissionColumns({ idType: 'string' }),
});

@model()
export class Permission extends ModelFactory.defineEntity({ table: permissionTable }) {}

export type TPermission = TEntityObject<typeof Permission>;
