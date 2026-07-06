import { IdType } from '@/base';
import { AnyType } from '@venizia/ignis-helpers';
import {
  type NodePgClient,
  type drizzle as nodePostgresConnector,
} from 'drizzle-orm/node-postgres';

/** Filter passed to loadFilteredPolicy: which principal's policies to load. */
export interface ICasbinPolicyFilter {
  principal: { type: string; id: IdType };
}

/** A drizzle connector able to run policy queries (pool- or transaction-backed). */
export type TCasbinPolicyConnector = ReturnType<
  typeof nodePostgresConnector<Record<string, AnyType>, NodePgClient>
>;

/** Minimal source the adapters depend on - any drizzle-backed datasource satisfies it. */
export interface ICasbinPolicySource {
  connector: TCasbinPolicyConnector;
}

/** Maps a logical table onto its physical name + schema. */
export interface IScopedCasbinTable {
  tableName: string;
  schemaName?: string;
}

/** All physical mapping the ScopedCasbinAdapter needs. App provides this; framework stays decoupled. */
export interface IScopedCasbinEntities {
  /**
   * The single edge table: each row links a subject (type+id) to a target (type+id), with a `variant`
   * column saying what kind of edge it is (grant / assign_role / *_inherits …) plus optional
   * action / effect / domain.
   */
  policyDefinition: IScopedCasbinTable;

  /** Permission catalog (id, code, ...). */
  permission: IScopedCasbinTable;

  /** Principal type labels used as casbin name prefixes. */
  principals: { user: string; role: string };

  /** Domain type labels (e.g. ['Merchant', 'Organizer']). */
  domainTypes: string[];

  /** Soft-delete handling for both tables. */
  softDelete?: { use: false } | { use: true; columnName: string };
}
