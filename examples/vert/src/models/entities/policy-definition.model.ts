import {
  BaseEntity,
  extraPolicyDefinitionColumns,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
export class PolicyDefinition extends BaseEntity<typeof PolicyDefinition.schema> {
  static override schema = pgTable('PolicyDefinition', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    ...extraPolicyDefinitionColumns({ idType: 'string' }),
  });

  static override relations = () => [];
}
