import type { IdType } from '@/base';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** Filter passed to loadFilteredPolicy: which principal's policies to load. */
export interface ICasbinPolicyFilter {
  principal: { type: string; id: IdType };
}

/** Drizzle connector for policy queries, typed on the shared `PgDatabase` base so postgres-js fits too. Declared here rather than imported from `@/connectors/postgres`: components depend on a minimal local contract, never a connector class. */
export type TCasbinPolicyConnector = PgDatabase<PgQueryResultHKT, Record<string, AnyType>>;

/** Minimal source the adapters depend on - any drizzle-backed datasource satisfies it. */
export interface ICasbinPolicySource {
  /** Preferred: lazily wires the driver on first read and survives pool rotation, mirroring repositories. */
  getConnector?(): TCasbinPolicyConnector;

  /** Back-compat: a pre-wired connector. Prefer getConnector on a real datasource. */
  connector?: TCasbinPolicyConnector;
}

/** Maps a logical table onto its physical name + schema. */
export interface IScopedCasbinTable {
  tableName: string;
  schemaName?: string;
}

/** All physical mapping the ScopedCasbinAdapter needs. App provides this; framework stays decoupled. */
export interface IScopedCasbinEntities {
  policyDefinition: IScopedCasbinTable & {
    metadata?: { columnName: string };
  };

  /** Permission catalog (id, code, ...). */
  permission: IScopedCasbinTable;

  /** Principal type labels used as casbin name prefixes. */
  principals: { user: string; role: string };

  /** Domain type labels (e.g. ['Merchant', 'Organizer']). */
  domainTypes: string[];

  /** Soft-delete handling for both tables. */
  softDelete?: { use: false } | { use: true; columnName: string };
}
