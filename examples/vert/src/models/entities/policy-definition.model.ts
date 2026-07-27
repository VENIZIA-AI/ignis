import { extraPolicyDefinitionColumns, model } from '@venizia/ignis';
import {
  BasePostgresEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class PolicyDefinition extends BasePostgresEntity<typeof PolicyDefinition.schema> {
  static override schema = pgTable('PolicyDefinition', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraPolicyDefinitionColumns({ idType: 'string' }),
  });

  static override relations = () => [];
}
