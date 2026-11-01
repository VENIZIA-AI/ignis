import { AuthModelColumns, model } from '@venizia/ignis';
import {
  PostgresIdEnricher,
  PostgresTzEnricher,
  ModelFactory,
  type TEntityObject,
} from '@venizia/ignis/postgres';
import { pgTable } from 'drizzle-orm/pg-core';

/** Casbin reads its policies from here: role assignments and permission grants, each in a domain. */
export const policyDefinitionTable = pgTable('PolicyDefinition', {
  ...PostgresIdEnricher.generateColumnDefs({ id: { dataType: 'string' } }),
  ...PostgresTzEnricher.generateColumnDefs(),
  ...AuthModelColumns.buildPolicyDefinition({ idType: 'string' }),
});

@model()
export class PolicyDefinition extends ModelFactory.defineEntity({ table: policyDefinitionTable }) {}

export type TPolicyDefinition = TEntityObject<typeof PolicyDefinition>;
