import { model } from '@venizia/ignis';
import {
  PostgresIdEnricher,
  PostgresUserAuditEnricher,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const configurationTable = pgTable('configurations', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  // Filled from the JWT of the request that writes the row; the CRUD routes ignore them in the body.
  ...PostgresUserAuditEnricher.generateColumnDefs({
    created: { dataType: 'string', columnName: 'created_by' },
    modified: { dataType: 'string', columnName: 'modified_by' },
  }),
  code: text('code').notNull().unique(),
  group: text('group').notNull(),
  description: text('description'),
});

@model()
export class Configuration extends ModelFactory.defineEntity({ table: configurationTable }) {}

export type TConfiguration = TEntityObject<typeof Configuration>;
