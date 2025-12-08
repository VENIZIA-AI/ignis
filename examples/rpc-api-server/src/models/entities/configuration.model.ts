import {
  BaseEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  TTableObject,
} from '@vez/ignis';
import { relations } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { User, usersTable } from './user.model';

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  static readonly TABLE_NAME = Configuration.name;

  constructor() {
    super({ name: Configuration.TABLE_NAME, schema: configurationTable });
  }
}

// ----------------------------------------------------------------
export const configurationTable = pgTable(
  Configuration.TABLE_NAME,
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
  def => [
    unique(`UQ_${Configuration.TABLE_NAME}_code`).on(def.code),
    /* check(
      `CHECK_${Configuration.TABLE_NAME}_dataType`,
      inArray(def.dataType, Array.from(DataTypes.SCHEME_SET)),
    ), */
    index(`IDX_${Configuration.TABLE_NAME}_group`).on(def.group),
    foreignKey({
      columns: [def.createdBy],
      foreignColumns: [usersTable.id],
      name: `FK_${Configuration.TABLE_NAME}_createdBy_${User.TABLE_NAME}_id`,
    }),
  ],
);

export const configurationRelations = relations(configurationTable, opts => {
  return {
    creator: opts.one(usersTable, {
      fields: [configurationTable.createdBy],
      references: [usersTable.id],
    }),
    modifier: opts.one(usersTable, {
      fields: [configurationTable.modifiedBy],
      references: [usersTable.id],
    }),
  };
});

export type TConfigurationSchema = typeof configurationTable;
export type TConfiguration = TTableObject<TConfigurationSchema>;

