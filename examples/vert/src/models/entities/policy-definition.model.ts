import { extraPolicyDefinitionColumns, model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

/** Casbin reads its policies from here: role assignments and permission grants, each in a domain. */
export const policyDefinitionTable = pgTable('PolicyDefinition', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  ...extraPolicyDefinitionColumns({ idType: 'string' }),
});

@model({ type: 'entity' })
export class PolicyDefinition extends ModelFactory.defineEntity({ table: policyDefinitionTable }) {}

export type TPolicyDefinition = TEntityObject<typeof PolicyDefinition>;
