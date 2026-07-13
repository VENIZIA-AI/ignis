import type { IdType } from '@/base';
import type { AnyType } from '@venizia/ignis-helpers';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** Filter passed to loadFilteredPolicy: which principal's policies to load. */
export interface ICasbinPolicyFilter {
  principal: { type: string; id: IdType };
}

/**
 * A drizzle connector able to run policy queries (pool- or transaction-backed). Typed on Drizzle's
 * shared `PgDatabase` base rather than a specific driver, so a postgres-js datasource satisfies it
 * too. Deliberately declared here, not imported from `@/connectors/postgres`: a component depends on
 * a minimal local contract, never on a connector class.
 */
export type TCasbinPolicyConnector = PgDatabase<PgQueryResultHKT, Record<string, AnyType>>;

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
