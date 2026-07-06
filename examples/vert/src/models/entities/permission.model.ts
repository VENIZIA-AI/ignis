import { extraPermissionColumns, model } from '@venizia/ignis';
import { BasePostgresEntity, generateIdColumnDefs, generateTzColumnDefs } from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class Permission extends BasePostgresEntity<typeof Permission.schema> {
  static override schema = pgTable('Permission', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraPermissionColumns({ idType: 'string' }),
  });

  static override relations = () => [];
}
