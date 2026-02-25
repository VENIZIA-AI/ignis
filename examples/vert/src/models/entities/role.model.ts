import {
  BaseEntity,
  extraRoleColumns,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class Role extends BaseEntity<typeof Role.schema> {
  static override schema = pgTable('Role', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraRoleColumns(),
  });

  static override relations = () => [];
}
