import { model } from '@venizia/ignis';
import { BasePostgresEntity, generateIdColumnDefs, generateTzColumnDefs } from '@venizia/ignis/postgres';
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class Organization extends BasePostgresEntity<typeof Organization.schema> {
  static override schema = pgTable('Organization', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    identifier: text('identifier').unique().notNull(),
    name: text('name').notNull(),
    description: text('description'),
    parentId: text('parent_id'), // Self-referencing for hierarchy (Company > Department > Team)
    status: text('status').notNull().default('activated'),
    isActive: boolean('is_active').notNull().default(true),
  });

  static override relations = () => [];
}
