import {
  BaseEntity,
  createRelations,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  RelationTypes,
  TTableObject,
} from '@vez/ignis';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { User, userTable } from './user.model';

@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<TConfigurationSchema> {
  static readonly TABLE_NAME = Configuration.name;

  constructor() {
    super({
      name: Configuration.TABLE_NAME,
      schema: configurationTable,
    });
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
    index(`IDX_${Configuration.TABLE_NAME}_group`).on(def.group),
    foreignKey({
      columns: [def.createdBy],
      foreignColumns: [userTable.id],
      name: `FK_${Configuration.TABLE_NAME}_createdBy_${User.TABLE_NAME}_id`,
    }),
  ],
);

export const configurationRelations = createRelations({
  source: configurationTable,
  relations: [
    {
      name: 'creator',
      type: RelationTypes.ONE,
      schema: userTable,
      metadata: {
        fields: [configurationTable.createdBy],
        references: [userTable.id],
      },
    },
    {
      name: 'modifier',
      type: RelationTypes.ONE,
      schema: userTable,
      metadata: {
        fields: [configurationTable.modifiedBy],
        references: [userTable.id],
      },
    },
  ],
});

export type TConfigurationSchema = typeof configurationTable;
export type TConfiguration = TTableObject<TConfigurationSchema>;
