import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

/** The authorization domain: a user's role assignments are scoped to one organization. */
export const organizationTable = pgTable('Organization', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  identifier: text('identifier').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  parentId: text('parent_id'),
  status: text('status').notNull().default('activated'),
  isActive: boolean('is_active').notNull().default(true),
});

@model({ type: 'entity' })
export class Organization extends ModelFactory.defineEntity({ table: organizationTable }) {}

export type TOrganization = TEntityObject<typeof Organization>;
