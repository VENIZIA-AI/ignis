import {
  BaseEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@vez/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';

export const configurationTable = pgTable('Configuration', {
  ...generateIdColumnDefs(),
  ...generateTzColumnDefs(),
  ...generateDataTypeColumnDefs(),
  code: text('code').unique(),
});

export type TConfigurationSchema = typeof configurationTable;
export type TConfiguration = InferSelectModel<TConfigurationSchema>;

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  constructor() {
    super({ name: Configuration.name, schema: configurationTable });
  }
}
