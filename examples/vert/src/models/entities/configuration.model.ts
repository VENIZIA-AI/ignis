import { model } from '@venizia/ignis';
import {
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  ModelFactory,
  one,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { userTable } from './user.model';

export const configurationTable = pgTable(
  'Configuration',
  {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...generateDataTypeColumnDefs(),
    ...generateUserAuditColumnDefs({
      created: { dataType: 'string', columnName: 'created_by' },
      modified: { dataType: 'string', columnName: 'modified_by' },
    }),
    code: text('code').notNull(),
    description: text('description'),
    group: text('group').notNull(),
  },
  table => [
    unique('UQ_Configuration_code').on(table.code),
    index('IDX_Configuration_group').on(table.group),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [userTable.id],
      name: 'FK_Configuration_createdBy_User_id',
    }),
  ],
);

/**
 * `creator` reads its columns off the `created_by` foreign key. `modified_by` has no foreign key,
 * so `modifier` names its columns.
 */
@model({ type: 'entity' })
export class Configuration extends ModelFactory.defineEntity({
  table: configurationTable,
  relations: () => ({
    creator: one(userTable),
    modifier: one(userTable, {
      fields: [configurationTable.modifiedBy],
      references: [userTable.id],
    }),
  }),
}) {}

export type TConfiguration = TEntityObject<typeof Configuration>;
