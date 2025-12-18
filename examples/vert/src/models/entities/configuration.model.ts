import {
  BaseEntity,
  generateDataTypeColumnDefs,
  generateIdColumnDefs,
  generateTzColumnDefs,
  generateUserAuditColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
} from '@venizia/ignis';
import { foreignKey, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { User } from './user.model';

// ----------------------------------------------------------------
/**
 * Configuration model using static schema pattern (Option A - Power Users)
 *
 * Demonstrates:
 * - Static schema with pgTable
 * - Static relations using TRelationConfig format
 * - Foreign keys and indexes in table definition
 * - No constructor needed
 */
@model({ type: 'entity' })
export class Configuration extends BaseEntity<typeof Configuration.schema> {
  static override schema = pgTable(
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
    def => [
      unique(`UQ_Configuration_code`).on(def.code),
      index(`IDX_Configuration_group`).on(def.group),
      foreignKey({
        columns: [def.createdBy],
        foreignColumns: [User.schema.id],
        name: `FK_Configuration_createdBy_User_id`,
      }),
    ],
  );

  // Define relations using TRelationConfig array format
  static override relations = (): TRelationConfig[] => [
    {
      name: 'creator',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Configuration.schema.createdBy],
        references: [User.schema.id],
      },
    },
    {
      name: 'modifier',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Configuration.schema.modifiedBy],
        references: [User.schema.id],
      },
    },
  ];
}
