import { extraRoleColumns, model } from '@venizia/ignis';
import {
  BasePostgresEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class Role extends BasePostgresEntity<typeof Role.schema> {
  static override schema = pgTable('Role', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraRoleColumns(),
  });

  static override relations = () => [];
}
