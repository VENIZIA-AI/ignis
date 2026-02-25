import {
  BaseEntity,
  extraPermissionColumns,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class Permission extends BaseEntity<typeof Permission.schema> {
  static override schema = pgTable('Permission', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraPermissionColumns({ idType: 'string' }),
  });

  static override relations = () => [];
}
