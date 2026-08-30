import { readResultRows } from '@/utilities';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { AuthorizationPolicyVariants } from '@venizia/ignis-kernel';
import { sql, type SQL } from 'drizzle-orm';
import { PolicyConnectorResolver } from './connector';
import type { ICasbinPolicySource, IScopedCasbinEntities } from './types';

const DEFAULT_SCHEMA = 'public';

export type TDomainHierarchyEdge = { child: string; parent: string };

/** Builds and runs the `domainHierarchy.load` query for ICasbinEnforcerOptions from the same entity
 * mapping ScopedCasbinAdapter takes. Reads the WHOLE `domain_inherits` tree - it is tenant-structural
 * and identical for every principal, so it is loaded once per process rather than per request. The SQL
 * fragments are precomputed once in the constructor and reused on every {@link load} call. */
export class DomainHierarchyLoader extends BaseHelper {
  private readonly dataSource: ICasbinPolicySource;
  private readonly policyDefinitionTable: SQL;
  private readonly softDeleteClause: SQL;

  constructor(opts: {
    dataSource: ICasbinPolicySource;
    entities: Pick<IScopedCasbinEntities, 'policyDefinition' | 'softDelete'>;
  }) {
    super({ scope: DomainHierarchyLoader.name });

    const { dataSource, entities } = opts;
    const { policyDefinition, softDelete } = entities;

    this.dataSource = dataSource;

    const schema = policyDefinition.schemaName ?? DEFAULT_SCHEMA;
    this.policyDefinitionTable = sql`${sql.identifier(schema)}.${sql.identifier(policyDefinition.tableName)}`;
    this.softDeleteClause = softDelete?.use
      ? sql` AND policyDefinition.${sql.identifier(softDelete.columnName)} IS NULL`
      : sql.empty();
  }

  /** Reads `this`, so hand it to `domainHierarchy.load` through a closure: `{ load: () => loader.load() }`. */
  async load(): Promise<TDomainHierarchyEdge[]> {
    const connector = PolicyConnectorResolver.resolve({
      source: this.dataSource,
      caller: DomainHierarchyLoader.name,
    });

    const result = await connector.execute(sql`
      SELECT
        policyDefinition.subject_type || '_' || policyDefinition.subject_id::text AS "child",
        policyDefinition.target_type || '_' || policyDefinition.target_id::text AS "parent"
      FROM ${this.policyDefinitionTable} policyDefinition
      WHERE policyDefinition.variant = ${AuthorizationPolicyVariants.DOMAIN_INHERITS.action}${this.softDeleteClause}
    `);

    return readResultRows<TDomainHierarchyEdge>({ result });
  }
}
